import { NextResponse } from 'next/server';

const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const DISCORD_CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET;
const DISCORD_REDIRECT_URI = process.env.DISCORD_REDIRECT_URI || 'http://localhost:3000/auth/callback';
const OWNER_ID = process.env.OWNER_ID;

export async function POST(request: Request) {
  try {
    const { code } = await request.json();

    if (!code) {
      return NextResponse.json({ success: false, error: 'No code provided' }, { status: 400 });
    }

    // Exchange code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID!,
        client_secret: DISCORD_CLIENT_SECRET!,
        grant_type: 'authorization_code',
        code,
        redirect_uri: DISCORD_REDIRECT_URI,
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('[Discord OAuth] Token exchange failed:', tokenData);
      return NextResponse.json({ success: false, error: 'Failed to exchange code for token' }, { status: 500 });
    }

    // Get user info
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    const userData = await userResponse.json();

    console.log('[Discord OAuth] User:', userData.id, userData.username);

    // Verify owner
    if (userData.id !== OWNER_ID) {
      console.warn('[Discord OAuth] Access denied for user:', userData.id);
      return NextResponse.json({ 
        success: false, 
        error: 'Access denied. You are not the authorized owner.' 
      }, { status: 403 });
    }

    // Create session (simple approach: set cookie with user ID)
    // In production, use JWT or proper session management
    const response = NextResponse.json({ 
      success: true, 
      user: { id: userData.id, username: userData.username } 
    });

    response.cookies.set('discord_user_id', userData.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
    });

    return response;
  } catch (error: any) {
    console.error('[Discord OAuth] Error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, { status: 500 });
  }
}
