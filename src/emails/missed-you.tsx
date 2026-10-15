import { Button, Heading, Link, Text } from "react-email";

import { EmailShell, INK, MUTED, button, paragraph } from "./theme";

// Rendered once per batch with Brevo placeholders as props (see lib/notifications.ts),
// then personalised per member by Brevo `messageVersions` params.

export type MissedYouProps = {
  firstName: string;
  /** "Sunday 18 October" */
  serviceDay: string;
  appUrl: string;
  unsubscribeUrl: string;
};

export function MissedYouEmail({ firstName, serviceDay, appUrl, unsubscribeUrl }: MissedYouProps) {
  return (
    <EmailShell
      preview={`We missed you on ${serviceDay}, ${firstName}`}
      footer={
        <Text style={{ color: MUTED, fontSize: 12, lineHeight: "18px", margin: 0 }}>
          You get this when you miss a Sunday.{" "}
          <Link href={unsubscribeUrl} style={{ color: MUTED, textDecoration: "underline" }}>
            Stop these emails
          </Link>
          .
        </Text>
      }
    >
      <Heading as="h1" style={{ color: INK, fontSize: 24, fontWeight: 600, margin: "28px 0 12px" }}>
        We missed you, {firstName}
      </Heading>
      <Text style={paragraph}>
        You weren&apos;t with us on {serviceDay}, and church wasn&apos;t quite the same without you.
        We hope everything is okay.
      </Text>
      <Text style={paragraph}>
        If something&apos;s going on and you&apos;d like to talk or pray with someone, any of your
        youth leaders would love to hear from you. We&apos;d love to see you this Sunday.
      </Text>
      <Button href={appUrl} style={button}>
        Open Pulse
      </Button>
    </EmailShell>
  );
}

MissedYouEmail.PreviewProps = {
  firstName: "Tobi",
  serviceDay: "Sunday 18 October",
  appUrl: "https://pulse.example.org",
  unsubscribeUrl: "https://pulse.example.org/unsubscribe?u=example&s=example",
} satisfies MissedYouProps;

export default MissedYouEmail;
