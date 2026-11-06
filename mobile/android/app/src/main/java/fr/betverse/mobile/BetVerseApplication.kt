package fr.betverse.mobile

import android.app.Application
import fr.betverse.app.beta.BuildConfig
import fr.betverse.mobile.data.AndroidSessionVault
import fr.betverse.mobile.data.BetVerseApi

class BetVerseApplication : Application() {
    val push by lazy { fr.betverse.mobile.push.PushController(this) }
    val api by lazy { BetVerseApi(BuildConfig.API_ORIGIN, AndroidSessionVault(this)) }
}
