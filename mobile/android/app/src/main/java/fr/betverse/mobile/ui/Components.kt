package fr.betverse.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Close
import androidx.compose.material.icons.outlined.Info
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.SportsSoccer
import androidx.compose.material.icons.outlined.ConfirmationNumber
import androidx.compose.material.icons.outlined.Groups
import androidx.compose.material.icons.outlined.Person
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import java.math.BigDecimal
import java.text.NumberFormat
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale
import fr.betverse.mobile.Destination

fun destinationIcon(destination: Destination) = when (destination) {
    Destination.HOME -> Icons.Outlined.Home
    Destination.MATCHES -> Icons.Outlined.SportsSoccer
    Destination.BETS -> Icons.Outlined.ConfirmationNumber
    Destination.AGENCY -> Icons.Outlined.Groups
    Destination.PROFILE -> Icons.Outlined.Person
}

fun verse(value: Long): String = NumberFormat.getIntegerInstance(Locale.FRANCE).format(value) + " V"
fun quote(value: BigDecimal): String = value.setScale(2).toPlainString().replace('.', ',')
fun matchDate(value: Instant): String = DateTimeFormatter.ofPattern("EEE d MMM · HH:mm", Locale.FRANCE)
    .withZone(ZoneId.systemDefault()).format(value)
@Composable fun Brand(modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
        Text("BV", color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Black,
            fontStyle = FontStyle.Italic, style = MaterialTheme.typography.titleLarge)
        Text("BETVERSE", fontWeight = FontWeight.ExtraBold, style = MaterialTheme.typography.titleMedium)
    }
}
@Composable fun ClubCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Surface(modifier, shape = RoundedCornerShape(12.dp), color = MaterialTheme.colorScheme.surface,
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
        Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp), content = content)
    }
}
@Composable fun Notice(message: String, error: Boolean, dismiss: (() -> Unit)? = null) {
    Surface(color = if (error) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer,
        shape = RoundedCornerShape(10.dp), modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite }) {
        Row(Modifier.padding(start = 12.dp, top = 8.dp, bottom = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Outlined.Info, null, Modifier.size(20.dp),
                tint = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer)
            Spacer(Modifier.width(8.dp))
            Text(message, Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium,
                color = if (error) MaterialTheme.colorScheme.onErrorContainer else MaterialTheme.colorScheme.onPrimaryContainer)
            if (dismiss != null) IconButton(onClick = dismiss) { Icon(Icons.Outlined.Close, "Fermer le message") }
        }
    }
}
@Composable fun EmptyState(title: String, text: String) {
    ClubCard(Modifier.fillMaxWidth()) {
        Text(title, style = MaterialTheme.typography.titleMedium)
        Text(text, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}
@Composable fun StatLine(label: String, value: String, prominent: Boolean = false) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
        Text(label, Modifier.weight(1f), fontWeight = if (prominent) FontWeight.Bold else FontWeight.Normal)
        Spacer(Modifier.width(12.dp))
        Text(value, fontWeight = FontWeight.Bold,
            color = if (prominent) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface)
    }
}
