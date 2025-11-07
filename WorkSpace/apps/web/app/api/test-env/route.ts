// Temporary debug endpoint to verify environment variables
export async function GET() {
  return Response.json({
    hasNextAuthSecret: !!process.env.NEXTAUTH_SECRET,
    hasNextAuthUrl: !!process.env.NEXTAUTH_URL,
    hasOwnerPassword: !!process.env.OWNER_PASSWORD,
    nextAuthUrl: process.env.NEXTAUTH_URL,
    nodeEnv: process.env.NODE_ENV,
  });
}
