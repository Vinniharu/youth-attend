import { Button, Heading, Section, Text } from "react-email";

import { EmailShell, INK, MUTED, TIDE, button, paragraph } from "./theme";

export type AdminFlagAlertProps = {
  memberName: string;
  streak: number;
  /** "Sunday 27 September", or null if they've never checked in. */
  lastAttended: string | null;
  followUpUrl: string;
};

export function AdminFlagAlertEmail({
  memberName,
  streak,
  lastAttended,
  followUpUrl,
}: AdminFlagAlertProps) {
  return (
    <EmailShell preview={`${memberName} has missed ${streak} Sundays in a row`}>
      <Heading as="h1" style={{ color: INK, fontSize: 24, fontWeight: 600, margin: "28px 0 12px" }}>
        {memberName} needs a follow-up
      </Heading>
      <Text style={paragraph}>
        They&apos;ve missed {streak} Sundays in a row, so Pulse has opened a follow-up for them.
      </Text>
      <Section
        style={{
          backgroundColor: TIDE,
          borderRadius: 14,
          margin: "0 0 20px",
          padding: "14px 18px",
        }}
      >
        <Text style={{ color: INK, fontSize: 15, margin: 0 }}>
          <strong>Missed in a row:</strong> {streak}
        </Text>
        <Text style={{ color: INK, fontSize: 15, margin: "6px 0 0" }}>
          <strong>Last attended:</strong> {lastAttended ?? "Not yet recorded"}
        </Text>
      </Section>
      <Button href={followUpUrl} style={button}>
        Open the follow-up
      </Button>
      <Text style={{ color: MUTED, fontSize: 13, lineHeight: "20px", margin: "20px 0 0" }}>
        Add notes or assign a leader there, and resolve it once someone has reached out.
      </Text>
    </EmailShell>
  );
}

AdminFlagAlertEmail.PreviewProps = {
  memberName: "Tobi Adeyemi",
  streak: 3,
  lastAttended: "Sunday 27 September",
  followUpUrl: "https://pulse.example.org/admin/follow-ups",
} satisfies AdminFlagAlertProps;

export default AdminFlagAlertEmail;
