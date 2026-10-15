import { Body, Container, Head, Heading, Html, Preview, Section, Text } from "react-email";

import { FONT, INK, MUTED, OCEAN, PAPER, TIDE } from "./theme";

export type LoginCodeEmailProps = {
  code: string;
  expiresInMinutes: number;
};

export function LoginCodeEmail({ code, expiresInMinutes }: LoginCodeEmailProps) {
  return (
    <Html lang="en">
      <Head />
      <Preview>{`Your Pulse sign-in code is ${code}`}</Preview>
      <Body style={{ backgroundColor: PAPER, fontFamily: FONT, margin: 0, padding: "32px 0" }}>
        <Container
          style={{
            backgroundColor: "#FFFFFF",
            borderRadius: 20,
            maxWidth: 440,
            padding: "36px 32px",
          }}
        >
          <Text style={{ color: OCEAN, fontSize: 18, fontWeight: 700, margin: 0 }}>Pulse</Text>
          <Heading
            as="h1"
            style={{ color: INK, fontSize: 24, fontWeight: 600, margin: "28px 0 8px" }}
          >
            Your sign-in code
          </Heading>
          <Text style={{ color: MUTED, fontSize: 15, lineHeight: "24px", margin: 0 }}>
            Enter this code in Pulse to sign in. It expires in {expiresInMinutes} minutes.
          </Text>
          <Section
            style={{
              backgroundColor: TIDE,
              borderRadius: 14,
              margin: "24px 0",
              padding: "18px 0",
              textAlign: "center",
            }}
          >
            <Text
              style={{
                color: INK,
                fontFamily: '"SFMono-Regular", Menlo, Consolas, monospace',
                fontSize: 32,
                fontWeight: 700,
                letterSpacing: "0.3em",
                margin: 0,
              }}
            >
              {code}
            </Text>
          </Section>
          <Text style={{ color: MUTED, fontSize: 13, lineHeight: "20px", margin: 0 }}>
            Didn&apos;t ask for this? You can ignore this email. Nobody can sign in without the
            code.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

LoginCodeEmail.PreviewProps = {
  code: "482915",
  expiresInMinutes: 10,
} satisfies LoginCodeEmailProps;

export default LoginCodeEmail;
