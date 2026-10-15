package com.jeevanrakshak.driver

internal object RequestAlertPolicy {
  fun mayStart(signedIn: Boolean, stoppedUntil: Long, now: Long, verifiedOffer: Boolean): Boolean =
    signedIn && (verifiedOffer || stoppedUntil <= now)

  fun shouldDismiss(checkedSession: String, currentSession: String?, checkedOffer: Long?, currentOffer: Long?, currentlyOffered: Boolean): Boolean =
    checkedSession == currentSession && checkedOffer == currentOffer && !currentlyOffered

  fun matchesRecipient(owner: String?, recipient: String?): Boolean =
    !owner.isNullOrEmpty() && !recipient.isNullOrEmpty() && owner == recipient
}
