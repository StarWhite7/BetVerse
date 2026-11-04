import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { z, id, username } from '../lib/validation.mjs';
import { ensure, transaction } from '../lib/errors.mjs';
import { notify, now, levelForXp, audit } from '../domain/accounts.mjs';
const role = z.enum(['DIRECTEUR', 'ASSOCIE', 'RESPONSABLE', 'MEMBRE', 'STAGIAIRE']);
const cosmetics = z
  .object({
    logoId: z.enum(['logo-1', 'logo-2', 'logo-3', 'logo-4']).optional(),
    primaryColor: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
    secondaryColor: z
      .string()
      .regex(/^#[a-fA-F0-9]{6}$/)
      .optional(),
    bannerStyle: z.enum(['grid', 'waves', 'rain', 'circuit']).optional(),
  })
  .strict();
export function agencyRoutes({ db }) {
  const router = Router();
  const member = (userId) => db.prepare('SELECT * FROM memberships WHERE userId=?').get(userId);
  const requireMember = (userId, roles) => {
    const row = member(userId);
    ensure(row, 403, 'Vous ne faites pas partie d’une agence.');
    ensure(!roles || roles.includes(row.role), 403, 'Votre rôle ne permet pas cette opération.');
    return row;
  };
  const agencyDto = (row, periodStart = null, periodEnd = null) => {
    if (!row) return null;
    const points = periodStart
      ? db
          .prepare(
            'SELECT COALESCE(SUM(points),0) score FROM agency_results WHERE agencyId=? AND createdAt>=? AND createdAt<?',
          )
          .get(row.id, periodStart, periodEnd).score
      : db
          .prepare('SELECT COALESCE(SUM(points),0) score FROM agency_results WHERE agencyId=?')
          .get(row.id).score;
    return {
      ...row,
      level: levelForXp(row.xp, 600, 320),
      clanScore: points,
      _count: {
        members: db.prepare('SELECT COUNT(*) n FROM memberships WHERE agencyId=?').get(row.id).n,
      },
      rank: 1,
    };
  };
  const byId = (agencyId) => {
    const agency = agencyDto(db.prepare('SELECT * FROM agencies WHERE id=?').get(agencyId));
    if (!agency) return null;
    const rank = db
      .prepare(
        `WITH scores AS (SELECT a.id,a.xp,COALESCE(SUM(r.points),0) points FROM agencies a LEFT JOIN agency_results r ON r.agencyId=a.id GROUP BY a.id),
      ranked AS (SELECT id,ROW_NUMBER() OVER (ORDER BY points DESC,xp DESC,id) rank FROM scores) SELECT rank FROM ranked WHERE id=?`,
      )
      .get(agencyId).rank;
    return { ...agency, rank };
  };
  const roster = (agencyId, privateView) => {
    const agency = byId(agencyId);
    ensure(agency, 404, 'Agence introuvable.');
    const members = db
      .prepare(
        `SELECT u.id,u.username,u.xp,u.createdAt,m.role agencyRole FROM memberships m JOIN users u ON u.id=m.userId WHERE m.agencyId=? ORDER BY u.username`,
      )
      .all(agencyId)
      .map((user) => ({
        ...user,
        predictionScore: db
          .prepare('SELECT COALESCE(SUM(points),0) n FROM votes WHERE agencyId=? AND userId=?')
          .get(agencyId, user.id).n,
      }));
    return { ...agency, members };
  };
  router.get('/me', (req, res) =>
    res.json(member(req.user.id) ? byId(member(req.user.id).agencyId) : null),
  );
  router.get('/roster', (req, res) =>
    res.json(member(req.user.id) ? roster(member(req.user.id).agencyId, true) : null),
  );
  router.get('/coordination', (req, res) => {
    const membership = requireMember(req.user.id),
      agency = byId(membership.agencyId);
    const total = agency.clanScore,
      completed = total >= 10;
    let activeStreak = 0;
    for (const result of db
      .prepare(
        'SELECT points FROM agency_results WHERE agencyId=? ORDER BY createdAt DESC,matchId DESC',
      )
      .all(membership.agencyId)) {
      if (result.points === 0) break;
      activeStreak++;
    }
    res.json({
      stats: {
        activeCount: completed ? 0 : 1,
        completedCount: completed ? 1 : 0,
        totalXp: agency.xp,
        activeStreak,
      },
      missions: [
        {
          id: 'first-ten-points',
          status: completed ? 'COMPLETED' : 'ACTIVE',
          progress: Math.min(10, total),
          target: 10,
          mission: {
            id: 'first-ten-points',
            slug: 'first-ten-points',
            title: 'Les premiers dix points',
            description: 'Cumulez dix points grâce aux pronostics collectifs de votre agence.',
            difficulty: 'EASY',
            rewardXp: 500,
            rewardTrophies: 1,
          },
        },
      ],
    });
  });
  router.get('/candidates', (req, res) => {
    const membership = requireMember(req.user.id, ['DIRECTEUR', 'ASSOCIE', 'RESPONSABLE']);
    const q = z
      .string()
      .max(24)
      .parse(req.query.q || '');
    const users = db
      .prepare(
        `SELECT id,username FROM users WHERE id NOT IN (SELECT userId FROM memberships) AND instr(lower(username),lower(?))>0 ORDER BY username LIMIT 20`,
      )
      .all(q);
    res.json(
      users.map((user) => ({
        ...user,
        pendingInvite: !!db
          .prepare("SELECT 1 FROM invitations WHERE userId=? AND agencyId=? AND status='PENDING'")
          .get(user.id, membership.agencyId),
      })),
    );
  });
  router.get('/invitations', (req, res) => {
    const invites = db
      .prepare(
        "SELECT * FROM invitations WHERE userId=? AND status='PENDING' ORDER BY createdAt DESC LIMIT 50",
      )
      .all(req.user.id);
    res.json(
      invites.map((invite) => ({
        ...invite,
        agency: byId(invite.agencyId),
        inviter: db.prepare('SELECT id,username FROM users WHERE id=?').get(invite.inviterId),
      })),
    );
  });
  router.post('/invitations', (req, res) => {
    const input = z.object({ username }).strict().parse(req.body);
    let invitationId;
    transaction(db, () => {
      const membership = requireMember(req.user.id, ['DIRECTEUR', 'ASSOCIE', 'RESPONSABLE']);
      const target = db.prepare('SELECT id FROM users WHERE username=?').get(input.username);
      ensure(target && !member(target.id), 409, 'Ce joueur est indisponible.');
      ensure(
        db.prepare('SELECT COUNT(*) n FROM memberships WHERE agencyId=?').get(membership.agencyId)
          .n < 50,
        409,
        'L’agence est complète (50 membres).',
      );
      const existing = db
        .prepare("SELECT id FROM invitations WHERE agencyId=? AND userId=? AND status='PENDING'")
        .get(membership.agencyId, target.id);
      if (existing) {
        invitationId = existing.id;
        return;
      }
      invitationId = randomUUID();
      db.prepare(
        'INSERT INTO invitations (id,agencyId,userId,inviterId,createdAt) VALUES (?,?,?,?,?)',
      ).run(invitationId, membership.agencyId, target.id, req.user.id, now());
      notify(
        db,
        target.id,
        'AGENCY_INVITE',
        'Invitation d’agence',
        `${req.user.username} vous invite à rejoindre ${byId(membership.agencyId).name}.`,
        null,
        membership.agencyId,
        invitationId,
      );
    });
    res.status(201).json({ id: invitationId });
  });
  for (const action of ['accept', 'decline'])
    router.post(`/invitations/:id/${action}`, (req, res) => {
      transaction(db, () => {
        const invite = db
          .prepare('SELECT * FROM invitations WHERE id=? AND userId=?')
          .get(id.parse(req.params.id), req.user.id);
        ensure(
          invite && invite.status === 'PENDING',
          409,
          'Cette invitation n’est plus disponible.',
        );
        if (action === 'accept') {
          ensure(!member(req.user.id), 409, 'Vous faites déjà partie d’une agence.');
          ensure(
            db.prepare('SELECT COUNT(*) n FROM memberships WHERE agencyId=?').get(invite.agencyId)
              .n < 50,
            409,
            'L’agence est complète.',
          );
          db.prepare("INSERT INTO memberships VALUES (?,?,'STAGIAIRE',?)").run(
            req.user.id,
            invite.agencyId,
            now(),
          );
          db.prepare(
            "UPDATE invitations SET status='DECLINED' WHERE userId=? AND status='PENDING'",
          ).run(req.user.id);
          db.prepare(
            "UPDATE notifications SET readAt=? WHERE userId=? AND type='AGENCY_INVITE'",
          ).run(now(), req.user.id);
        }
        const status = action === 'accept' ? 'ACCEPTED' : 'DECLINED';
        db.prepare('UPDATE invitations SET status=? WHERE id=?').run(status, invite.id);
        db.prepare('UPDATE notifications SET type=?,readAt=? WHERE inviteId=? AND userId=?').run(
          `AGENCY_INVITE_${status}`,
          now(),
          invite.id,
          req.user.id,
        );
        notify(
          db,
          invite.inviterId,
          `AGENCY_INVITE_${status}`,
          'Invitation traitée',
          `${req.user.username} a ${action === 'accept' ? 'accepté' : 'décliné'} votre invitation.`,
          null,
          invite.agencyId,
          invite.id,
        );
      });
      res.json({ success: true });
    });
  router.patch('/members/roles', (req, res) => {
    const { changes } = z
      .object({ changes: z.array(z.object({ id, role }).strict()).min(1).max(50) })
      .strict()
      .parse(req.body);
    transaction(db, () => {
      const membership = requireMember(req.user.id, ['DIRECTEUR']);
      const members = db
        .prepare('SELECT * FROM memberships WHERE agencyId=?')
        .all(membership.agencyId);
      ensure(
        new Set(changes.map((x) => x.id)).size === changes.length &&
          changes.every((x) => members.some((m) => m.userId === x.id)),
        400,
        'Liste de membres invalide.',
      );
      const final = members.map((m) => ({
        ...m,
        role: changes.find((x) => x.id === m.userId)?.role || m.role,
      }));
      ensure(
        final.filter((m) => m.role === 'DIRECTEUR').length === 1,
        400,
        'L’agence doit avoir exactement un directeur.',
      );
      db.prepare("UPDATE memberships SET role='MEMBRE' WHERE agencyId=? AND role='DIRECTEUR'").run(
        membership.agencyId,
      );
      for (const m of final)
        db.prepare('UPDATE memberships SET role=? WHERE userId=?').run(m.role, m.userId);
      audit(db, req.user.id, 'AGENCY_ROLES_UPDATED', membership.agencyId, { changes });
    });
    res.json({ success: true });
  });
  router.post('/leave', (req, res) => {
    transaction(db, () => {
      const membership = requireMember(req.user.id);
      ensure(
        membership.role !== 'DIRECTEUR',
        409,
        'Transférez la direction ou supprimez votre agence avant de partir.',
      );
      db.prepare('DELETE FROM memberships WHERE userId=?').run(req.user.id);
      audit(db, req.user.id, 'AGENCY_LEFT', membership.agencyId);
    });
    res.json({ success: true });
  });
  router.patch('/me', (req, res) => {
    const input = cosmetics.parse(req.body);
    transaction(db, () => {
      const membership = requireMember(req.user.id, ['DIRECTEUR', 'ASSOCIE']),
        agency = byId(membership.agencyId);
      const merged = { ...agency, ...input };
      db.prepare(
        'UPDATE agencies SET logoId=?,primaryColor=?,secondaryColor=?,bannerStyle=?,updatedAt=? WHERE id=?',
      ).run(
        merged.logoId,
        merged.primaryColor,
        merged.secondaryColor,
        merged.bannerStyle,
        now(),
        agency.id,
      );
    });
    res.json(byId(member(req.user.id).agencyId));
  });
  router.post('/', (req, res) => {
    const input = cosmetics
      .extend({ name: z.string().trim().min(3).max(40) })
      .strict()
      .parse(req.body);
    let agencyId;
    transaction(db, () => {
      ensure(!member(req.user.id), 409, 'Vous avez déjà une agence.');
      const debit = db
        .prepare('UPDATE wallets SET shards=shards-100,updatedAt=? WHERE userId=? AND shards>=100')
        .run(now(), req.user.id);
      ensure(debit.changes === 1, 409, 'Il faut 100 shards pour créer une agence.');
      agencyId = randomUUID();
      const timestamp = now();
      db.prepare(
        'INSERT INTO agencies (id,name,logoId,primaryColor,secondaryColor,bannerStyle,createdAt,updatedAt) VALUES (?,?,?,?,?,?,?,?)',
      ).run(
        agencyId,
        input.name,
        input.logoId || 'logo-1',
        input.primaryColor || '#22d3ee',
        input.secondaryColor || '#a855f7',
        input.bannerStyle || 'grid',
        timestamp,
        timestamp,
      );
      db.prepare("INSERT INTO memberships VALUES (?,?,'DIRECTEUR',?)").run(
        req.user.id,
        agencyId,
        timestamp,
      );
      audit(db, req.user.id, 'AGENCY_CREATED', agencyId);
    });
    res.status(201).json(byId(agencyId));
  });
  router.delete('/', (req, res) => {
    transaction(db, () => {
      const membership = requireMember(req.user.id, ['DIRECTEUR']);
      db.prepare('DELETE FROM agencies WHERE id=?').run(membership.agencyId);
      audit(db, req.user.id, 'AGENCY_DELETED', membership.agencyId);
    });
    res.json({ success: true });
  });
  const summaries = (userId, query) => {
    const membership = requireMember(userId);
    const ids = query.matchIds
      ? z.array(id).max(100).parse(String(query.matchIds).split(','))
      : null;
    const status = query.status
      ? z.enum(['UPCOMING', 'LIVE', 'FINISHED']).parse(query.status)
      : null;
    const matches = db
      .prepare('SELECT id,status FROM matches ORDER BY startDate LIMIT 500')
      .all()
      .filter((m) => (!ids || ids.includes(m.id)) && (!status || m.status === status));
    return matches.map((match) => {
      const mine = db
        .prepare(
          'SELECT homeScore,awayScore FROM votes WHERE userId=? AND agencyId=? AND matchId=?',
        )
        .get(userId, membership.agencyId, match.id);
      const aggregate = db
        .prepare(
          'SELECT homeScore,awayScore,COUNT(*) n FROM votes WHERE agencyId=? AND matchId=? GROUP BY homeScore,awayScore ORDER BY n DESC,homeScore,awayScore LIMIT 1',
        )
        .get(membership.agencyId, match.id);
      return {
        matchId: match.id,
        userScore: mine || null,
        agencyScore: aggregate
          ? { homeScore: aggregate.homeScore, awayScore: aggregate.awayScore }
          : null,
        totalVotes: db
          .prepare('SELECT COUNT(*) n FROM votes WHERE agencyId=? AND matchId=?')
          .get(membership.agencyId, match.id).n,
      };
    });
  };
  router.get('/match-votes', (req, res) => res.json(summaries(req.user.id, req.query)));
  router.post('/match-votes', (req, res) => {
    const { votes } = z
      .object({
        votes: z
          .array(
            z
              .object({
                matchId: id,
                homeScore: z.number().int().min(0).max(200),
                awayScore: z.number().int().min(0).max(200),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict()
      .parse(req.body);
    transaction(db, () => {
      const membership = requireMember(req.user.id);
      for (const vote of votes) {
        const match = db.prepare('SELECT * FROM matches WHERE id=?').get(vote.matchId);
        ensure(
          match && match.status === 'UPCOMING' && Date.parse(match.startDate) > Date.now(),
          409,
          'Les votes sont fermés pour une rencontre sélectionnée.',
        );
        const previous = db
          .prepare('SELECT agencyId FROM votes WHERE userId=? AND matchId=?')
          .get(req.user.id, vote.matchId);
        ensure(
          !previous || previous.agencyId === membership.agencyId,
          409,
          'Vous avez déjà pronostiqué ce match dans une autre agence.',
        );
        db.prepare(
          'INSERT INTO votes (userId,agencyId,matchId,homeScore,awayScore) VALUES (?,?,?,?,?) ON CONFLICT(userId,matchId) DO UPDATE SET homeScore=excluded.homeScore,awayScore=excluded.awayScore',
        ).run(req.user.id, membership.agencyId, vote.matchId, vote.homeScore, vote.awayScore);
      }
    });
    res.json(summaries(req.user.id, { matchIds: votes.map((v) => v.matchId).join(',') }));
  });
  router.get('/', (req, res) => {
    const { period, periodOffset } = z
      .object({
        period: z.enum(['weekly', 'monthly', 'annual']).optional(),
        periodOffset: z.coerce.number().int().min(-1).max(0).default(0),
      })
      .parse(req.query);
    let start = null,
      end = null;
    if (period) {
      const date = new Date();
      date.setUTCHours(0, 0, 0, 0);
      if (period === 'weekly') {
        date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7) + periodOffset * 7);
        start = date.toISOString();
        date.setUTCDate(date.getUTCDate() + 7);
      }
      if (period === 'monthly') {
        date.setUTCDate(1);
        date.setUTCMonth(date.getUTCMonth() + periodOffset);
        start = date.toISOString();
        date.setUTCMonth(date.getUTCMonth() + 1);
      }
      if (period === 'annual') {
        date.setUTCMonth(0, 1);
        date.setUTCFullYear(date.getUTCFullYear() + periodOffset);
        start = date.toISOString();
        date.setUTCFullYear(date.getUTCFullYear() + 1);
      }
      end = date.toISOString();
    }
    res.json(
      db
        .prepare('SELECT * FROM agencies LIMIT 500')
        .all()
        .map((a) => agencyDto(a, start, end))
        .sort((a, b) => b.clanScore - a.clanScore || b.xp - a.xp || a.id.localeCompare(b.id))
        .map((a, i) => ({ ...a, rank: i + 1 })),
    );
  });
  router.get('/:id', (req, res) =>
    res.json(roster(id.parse(req.params.id), member(req.user.id)?.agencyId === req.params.id)),
  );
  return router;
}
