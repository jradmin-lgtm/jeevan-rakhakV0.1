import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminSession } from '../../../lib/adminSession';
import { getKeepalive } from '../../../lib/keepalive';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:NextRequest) {
 const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
 if(!await verifyAdminSession(req.cookies.get('jr-admin-session')?.value,process.env.JR_ADMIN_SESSION_SECRET??''))return NextResponse.json({error:'unauthorized'},{status:401,headers});
 return NextResponse.json(await getKeepalive(),{headers});
}
