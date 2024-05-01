/* eslint-disable turbo/no-undeclared-env-vars */
import type { NextAuthOptions, Session } from 'next-auth'

import NextAuth from 'next-auth'
import { JWT } from 'next-auth/jwt'

import { drupal } from '../drupal'
import DrupalCredentialsProvider from './providers/DrupalCredentials'

async function refreshAccessToken(token: JWT) {
  const clientId = process.env.DRUPAL_CLIENT_ID || ''
  const clientSecret = process.env.DRUPAL_CLIENT_SECRET || ''
  const oauthUrl = process.env.NEXT_PUBLIC_DRUPAL_BASE_URL
    ? `${process.env.NEXT_PUBLIC_DRUPAL_BASE_URL}/oauth/token`
    : ''

  const response = await fetch(oauthUrl, {
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'refresh_token',
      refresh_token: token.refresh_token || '',
    }),
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    method: 'POST',
  })

  const data = await response.json()

  if (!response.ok) {
    console.log(response)
    return {
      error: {
        message: response.statusText,
        statusCode: response.status,
      },
    }
  }

  console.log(
    '== refreshAccessToken ==',
    data.access_token?.substr(data.access_token.length - 5),
  )

  return {
    ...token,
    access_token: data.access_token,
    expires_in: Date.now() + data.expires_in * 1000,
    // expires_in: Date.now() + 5 * 1000,
    refresh_token: data.refresh_token,
  }
}

export const authOptions = {
  callbacks: {
    async jwt({ account, token, user }) {
      // Initial sign in
      if (account && user) {
        return {
          access_token: user.access_token,
          email: user.email,
          expires_in: Date.now() + (user.expires_in || 0) * 1000,
          // expires_in: Date.now() + 5 * 1000,
          name: user.name,
          refresh_token: user.refresh_token,
        }
      }

      // Return previous token if the access token has not expired yet
      if (Date.now() < (token.expires_in || 0)) {
        return token
      }

      // Access token has expired, try to update it
      return refreshAccessToken(token)
    },
    async session({ session, token }: { session: Session; token: JWT }) {
      if (token.error) {
        drupal.session = null
        return {
          ...session,
          error: token.error,
        }
      }
      session.user = {
        email: token.email,
        name: token.name,
      }
      session.access_token = token.access_token
      session.access_token_expires = token.expires_in

      drupal.session = session

      return session
    },
  },
  providers: [DrupalCredentialsProvider()],
  secret: process.env.NEXTAUTH_SECRET || '',
  session: {
    maxAge: 30 * 24 * 60 * 60, // 30 Days
    strategy: 'jwt',
  },
} satisfies NextAuthOptions

export { default as SessionProvider } from './SessionProvider'

export default NextAuth(authOptions)
