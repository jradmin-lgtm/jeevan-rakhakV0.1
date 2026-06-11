import React from "react";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Delete your account · Jeevan Rakshak",
  description:
    "How to delete your Jeevan Rakshak account and associated data, what is removed, and what is retained."
};

const CONTACT_EMAIL = "contact.jeevanrakshak@gmail.com";

export default function DeleteAccountPage() {
  return (
    <article className="privacy">
      <header>
        <h1>Delete your Jeevan Rakshak account</h1>
        <p className="meta">
          Applies to the Jeevan Rakshak patient app and the Jeevan Rakshak Driver
          app, operated by the Jeevan Rakshak team.
        </p>
      </header>

      <section>
        <h2>Option 1: Delete from inside the app (fastest)</h2>
        <p>
          <strong>Patient app (Jeevan Rakshak):</strong>
        </p>
        <ol>
          <li>Open the app and sign in.</li>
          <li>
            On the Home screen, scroll to the account actions and tap{" "}
            <strong>Delete account</strong>.
          </li>
          <li>Confirm in the dialog. Your account and data are removed right away.</li>
        </ol>
        <p>
          <strong>Driver app (Jeevan Rakshak Driver):</strong>
        </p>
        <ol>
          <li>Open the app and sign in.</li>
          <li>
            On the Dashboard, tap <strong>Delete account</strong>.
          </li>
          <li>Confirm in the dialog.</li>
        </ol>
        <p>
          You cannot delete your account while a ride is in progress. Finish or
          cancel the active trip first, then delete.
        </p>
      </section>

      <section>
        <h2>Option 2: Request deletion by email</h2>
        <p>
          If you can no longer sign in, email{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address
          linked to your account (or include your registered phone number) with the
          subject <code>Delete my account</code>. We verify ownership and complete
          the deletion within 30 days.
        </p>
      </section>

      <section>
        <h2>What is deleted</h2>
        <ul>
          <li>Your profile: name, email, and the link to your Google account.</li>
          <li>
            Patients: your saved medical profile (blood group, allergies,
            condition) and emergency contact.
          </li>
          <li>
            Drivers: your verification details (driving licence number, vehicle and
            registration numbers, insurance and ambulance-permit numbers) and your
            online/location status.
          </li>
        </ul>
      </section>

      <section>
        <h2>What is retained, and for how long</h2>
        <ul>
          <li>
            Completed trip records (pickup and drop points, time, fare) are kept in
            anonymised form for hospital billing, medico-legal, and regulatory
            reasons. After deletion they can no longer be traced back to you.
          </li>
          <li>
            Your phone number may be retained in a de-linked form solely to preserve
            trip-history integrity and prevent abuse, as described in our{" "}
            <a href="/privacy">Privacy Policy</a>.
          </li>
          <li>
            Records we are required to keep by law are retained only for the period
            the law requires, then deleted.
          </li>
        </ul>
      </section>

      <footer>
        <p className="meta">
          Questions about deletion? Contact the Jeevan Rakshak team at{" "}
          <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. See also our{" "}
          <a href="/privacy">Privacy Policy</a>.
        </p>
      </footer>

      <style>{`
        .privacy {
          max-width: 760px;
          margin: 0 auto;
          padding: 32px 24px 64px;
          color: #0F172A;
          line-height: 1.65;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .privacy h1 { font-size: 32px; margin: 0 0 4px; }
        .privacy h2 { font-size: 20px; margin: 32px 0 8px; border-top: 1px solid #E2E8F0; padding-top: 24px; }
        .privacy p, .privacy li { font-size: 15px; }
        .privacy .meta { color: #64748B; font-size: 14px; }
        .privacy a { color: #E5322B; }
        .privacy code { background: #F1F5F9; padding: 1px 6px; border-radius: 4px; font-size: 13px; }
        .privacy ul, .privacy ol { padding-left: 22px; }
      `}</style>
    </article>
  );
}
