import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import Discord from 'next-auth/providers/discord';

// Build providers array - only include Discord if credentials are available
const providers: any[] = [
  Credentials({
    credentials: {
      password: { label: "Password", type: "password" }
    },
    async authorize(credentials) {
      // Simple password-based fallback
      const password = credentials?.password as string;
      const ownerPassword = process.env.OWNER_PASSWORD || 'changeme123';
      
      if (password === ownerPassword) {
        return {
          id: 'owner',
          email: 'owner@coinruler.local',
          name: 'Owner'
        };
      }
      return null;
    },
  }),
];

// Only add Discord provider if credentials exist
if (process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET) {
  providers.push(
    Discord({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    })
  );
}

export const authConfig = {
  trustHost: true, // Allow localhost and production URLs
  pages: {
    signIn: '/login',
  },
  providers,
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const isOnLoginPage = nextUrl.pathname.startsWith('/login');
      
      if (isOnLoginPage) {
        if (isLoggedIn) return Response.redirect(new URL('/', nextUrl));
        return true;
      }
      
      return isLoggedIn;
    },
    async signIn({ user, account }) {
      // Only allow specific Discord ID or password auth
      if (account?.provider === 'discord') {
        const allowedDiscordId = process.env.OWNER_DISCORD_ID;
        if (allowedDiscordId && user.id !== allowedDiscordId) {
          return false; // Reject login
        }
      }
      return true;
    },
  },
} satisfies NextAuthConfig;
