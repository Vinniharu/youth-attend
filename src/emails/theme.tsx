import { Body, Container, Head, Html, Preview, Text } from "react-email";

// Email clients ignore CSS variables and web fonts, so Pulse tokens are inlined here.
// Keep in sync with src/app/globals.css (the one exception to the no-raw-hex rule).
export const INK = "#0E1726";
export const MUTED = "#5B6B82";
export const OCEAN = "#0B6BCB";
export const TIDE = "#E6F1FB";
export const PAPER = "#F7F9FC";
export const FONT =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

export const paragraph = { color: MUTED, fontSize: 15, lineHeight: "24px", margin: "0 0 16px" };

export const button = {
  backgroundColor: OCEAN,
  borderRadius: 12,
  color: "#FFFFFF",
  display: "inline-block",
  fontSize: 15,
  fontWeight: 600,
  padding: "12px 20px",
  textDecoration: "none",
};

/** The shared frame: page background, white card, "Pulse" wordmark, footer slot. */
export function EmailShell({
  preview,
  children,
  footer,
}: {
  preview: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: PAPER, fontFamily: FONT, margin: 0, padding: "32px 0" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            maxWidth: 480,
            padding: "36px 32px",
          }}
        >
          <Text style={{ color: OCEAN, fontSize: 18, fontWeight: 700, margin: 0 }}>Pulse</Text>
          {children}
        </Container>
        {footer && (
          <Container style={{ maxWidth: 480, padding: "16px 32px 0" }}>{footer}</Container>
        )}
      </Body>
    </Html>
  );
}
