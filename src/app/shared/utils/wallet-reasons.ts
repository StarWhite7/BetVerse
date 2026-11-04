export function walletReason(reason?: string): string {
  const labels: Record<string, string> = {
    DAILY_REWARD: 'Bonus quotidien',
    BET_STAKE: 'Mise',
    BET_PAYOUT: 'Gain de pari',
    BET_REFUND: 'Remboursement de pari',
    ADMIN_ADJUSTMENT: 'Ajustement administrateur',
    TRANSFER: 'Transfert',
  };
  return reason ? (labels[reason] ?? 'Opération de jeu') : 'Opération de jeu';
}
