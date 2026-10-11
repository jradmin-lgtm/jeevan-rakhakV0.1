# Independent UI council review

Reviewer 2, 11 October 2026. Verdict: **SHIP for the reviewed UI changes, 87/100**. This is a scoped UI and native-flow sign-off, not independent certification of production infrastructure, load capacity, device push delivery, or every Android variant. UI visual quality is separately **8/10**.

| Dimension | Score | Basis |
|---|---:|---|
| Correctness | 35/40 | Core booking, assignment, trip and post-trip paths exercised. Four discovered functional/accessibility regressions corrected and retested. Real-device alerts and network fault matrix remain outside observed coverage. |
| Completeness | 17/20 | UA1-6 and DA1-2 visually and functionally covered. DA3 permission-resume path verified. DA4 server wave scale evidence belongs to parent/backend reviewer. |
| Craft | 17/20 | Meaningful hierarchy, distinct choices, large-text access, explicit subtypes. Hindi large text requires scrolling; OTP accessibility label remains English. |
| Evidence | 8/10 | Fresh native screenshots and accessibility trees, real Android11 interactions, local ride lifecycle and foreground-service evidence. No physical Infinix or full TalkBack session. |
| Rules | 10/10 | Read-only source review. Isolated QA fixtures only. No production actions, credential reading, external messaging, or consultation with the other reviewer. |

## Review scope and provenance

Read both extracted team documents and all 14 supplied screenshots. Compared Home, SOS, booking, tracking, driver dashboard, incoming requests, trip/OTP and navigation behavior to those requirements. Source base HEAD was 46dba9e4f3998ce30c39d4b8a1b94de41d65c4b5 with parent changes; exact final reviewed source and candidate APK SHA256 values are in council-ui-review-hashes.json. These are QA APKs pointing to isolated API4400, not production APK certification.

Native tests used Android11 emulator-5554. EN normal-size flows were exercised first. Hindi 320dp review followed; initial screenshots named hi320 were taken after changing font scale at runtime and MUST NOT be cited as confirmed130% evidence. Final files named final-*-130 followed cold app restarts at 320dp, font_scale1.3 and prove the actual enlarged text rendering. Reduced-motion settings were used for stable accessibility dumps. Normal animation was initially visually observed, but animation timing was not instrumented.

## Fixed findings verified on rebuilt candidates

1. Booking Emergency expansion retained OPD selection and could submit the wrong type. Final: opening Emergency clears OPD, confirm-booking reports enabled=false until a subtype is selected. Selecting Breathing collapses the group and displays the selected subtype. Evidence user-final-emergency-cleared-130.png.xml and user-final-emergency-selected-130.png.
2. Background location permission grant returned while the app was still backgrounded, causing ERR_FOREGROUND_SERVICE_START_NOT_ALLOWED and a misleading denied-permission warning. Final: revoke background permission, accept own ride, choose Allow all the time in Android Settings, return to app. LocationTaskService starts isForeground=true and createdFromFg=true; stale warning absent. Evidence driver-final-permission-settings.png and driver-final-permission-service.txt.
3. OTP used a near-invisible inaccessible focus target. Final: ride-otp-input is a full-size, enabled, focusable android.widget.EditText; tapping opens the numeric keyboard. Entering the actual own-ride code fills all boxes and dismisses the keyboard, leaving Start Ride reachable. Evidence driver-final-otp-accessible-130.png.xml, driver-final-otp-focus.png and driver-final-otp-entered-130.png.
4. Incoming SOS overflowed at true130% Hindi, clipping Accept/Dismiss under Android navigation. Final: details scroll above a fixed visible action row. Evidence driver-final-incoming-130.png (defect) versus driver-final-modal-fixed-130.png (fixed).
5. An unrelated queued SOS could cover an already accepted ride. Final: accepted own final fixture with another request queued, then opened BUSY Dashboard. Neither active Trip nor Dashboard was covered by the stale popup. Evidence driver-final-accepted-no-overlay-130.png and driver-final-dashboard-busy-130.png.

## Requirement/control coverage

| Requirement | Observed acceptance evidence |
|---|---|
| UA1 Home SOS and separation | Circular SOS opens SOS route; distinct Book card; Home quick actions open History, Profile, Support. user-home.png; user-final-home-130.png; user-final-home-bottom-130.png. |
| UA2 red SOS and warning | Red surface, circular control, white warning, outlined Cancel. Category sheet opens and Android Back closes it; Cancel returns Home. Support call remains reachable. user-sos.png; user-sos-categories.png; user-final-sos-130.png; user-final-sos-bottom-130.png. |
| UA3 routine request cards | Pregnancy, Referral, OPD each selected; distinct icons, pink full-width rows, correct visible fare changes. user-book-pregnancy.png; user-book-referral.png; user-book-opd.png; user-final-types-130.png. |
| UA4 Emergency subtypes | Breathing and Cardiac chosen; no auto-dispatch on expansion. Final OPD-to-Emergency regression cleared. user-book-breathing.png; user-book-cardiac.png; final-emergency files. |
| Pickup/drop/landmark/fare preserved | Google renderer visible; pickup map confirmed; drop set and cleared; area selected; custom landmark edited and retained; coupon expands fare to zero. user-pickup-map.png; user-drop-map.png; user-landmark-custom.png; user-fare-offer.png. |
| UA5 active driver contact and post-trip rating | Assigned driver phone shown in place of active rating, call opens native dialer. Completed and paid ride exposes rating form, five-star rating saved, ended-trip contact absent. user-assigned-phone.png; user-call-driver.png; user-rating-after-payment.png; user-rating-saved.png. Synthetic test phone means real number dialability was not assessed. |
| UA6 quick actions | Distinct icon/color treatments; all three user destinations open. user-home.png; user-history.png; user-profile.png; user-support.png. |
| DA1 availability | Offline gray status and black Go Online become green Online; BUSY shown after accept. driver-dashboard.png; driver-online.png; driver-final-dashboard-busy-130.png. |
| DA2 readability and incoming ETA | Incoming request shows distance, ETA, area/landmark and address. Long Hindi/English content and actual130% verified. Driver history/profile/help reachable. driver-final-modal-fixed-130.png; driver-history-hi320.png; driver-profile-hi320.png; driver-support-hi320.png. |
| DA3 queue/background | Permission regression reproduced and fixed; foreground service confirmed. This reviewer did not simulate full GPS offline/reconnect/ACK concurrency matrix; parent/backend evidence required. |
| DA4 normal-booking waves | Source review preserved normal-vs-SOS distinction. Runtime wave concurrency is parent/backend review responsibility, not claimed as independently executed here. |
| Driver trip lifecycle | Own first QA ride accepted, arrived, OTP entered, pickup started, Maps handoff, drop completion confirmed; user paid zero coupon and rated. External Maps required emulator app update, so actual turn-by-turn route execution remains unverified. |

## Seven edge-case classes

- Empty/null: no request type keeps submit disabled; initial OTP empty; optional drop cleared; completed contact hidden.
- Boundary: 320dp viewport, actual130% font, Hindi wrapping, first/last request types, four OTP digits. Final required controls remain reachable.
- Concurrency: two pending requests around accept exposed stale modal; fixed and retested. 50-ride concurrency was not run by this reviewer.
- Failure: permission-resume foreground-service failure reproduced and retested after fix; external Maps update-required state observed. Arbitrary network500/timeouts not injected here.
- Malformed: not independently exercised through API; parent/backend suite covers validation. UI test fixtures used valid schema and synthetic phone identifiers.
- Scale: long address/landmark, Hindi and expanded fonts exercised. Large real-world dataset/performance is outside this UI review.
- Permission: background permission revoked, requested, granted and foreground tracking verified. Completed-trip contact privacy observed. Full TalkBack navigation, remote role-abuse attempts and real push permission delivery not tested here.

## Remaining limits and non-blocking polish

Physical Infinix XOS/Dolphin Android11 is unavailable. Emulator success does not establish all-vendor compatibility. FCM push receipt, buzzer/ringtone playback and DND bypass on real devices require device evidence. Native dialer handoff used synthetic identifiers. Google Maps renderer worked in tested screens, while external Google Maps navigation was blocked by that emulator's outdated Maps app. No assertion of zero regressions or universal device support is warranted.

Minor follow-up: localize the OTP accessibility label in Hindi and consider aligning distance/ETA baselines at maximum fonts. These did not block task completion in the tested flows.

## Cleanup and handoff

Own first QA ride completed/paid/rated; second and third test rides cancelled after review. QA driver set OFFLINE. No unrelated booking was accepted/rejected or mutated. Emulator released to parent; screen override reset, font_scale restored1.0, animation scales restored1. Parent should cold-start apps for normal settings and run final production upgrade checks. No deployment performed by reviewer.
