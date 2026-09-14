/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head>
      <style>{darkModeCss}</style>
    </Head>
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>You've been invited</Heading>
        <Text style={text}>
          You've been invited to join{' '}
          <Link href={siteUrl} style={link}>
            <strong>{siteName}</strong>
          </Link>
          . Click the button below to accept the invitation and create your
          account.
        </Text>
        <Button className="dm-btn" style={button} href={confirmationUrl}>
          Accept Invitation
        </Button>
        <Text style={footer}>
          If you weren't expecting this invitation, you can safely ignore this
          email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#f5f6fb', fontFamily: "'Space Grotesk', 'Helvetica Neue', Arial, sans-serif" }
const container = { padding: '28px 25px', backgroundColor: '#ffffff', borderRadius: '14px', border: '1px solid #e3e5f0' }
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: '#14162e',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: '#4a4d6b',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: '#2e3a8c',
  color: '#ffffff',
  fontSize: '14px',
  border: '1px solid #2e3a8c',
  borderRadius: '14px',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
// Rendered as a text child, which React may HTML-escape: keep this CSS free of >, &, and quotes.
const darkModeCss = `
  @media (prefers-color-scheme: dark) {
    .dm-btn { background-color: #2e3a8c !important; color: #ffffff !important; }
  }
  [data-ogsc] .dm-btn { background-color: #2e3a8c !important; color: #ffffff !important; }
  [data-ogsb] .dm-btn { background-color: #2e3a8c !important; color: #ffffff !important; }
`
