import { NextRequest, NextResponse } from 'next/server';
import { contacts, sessions, messages, cards } from '@/lib/mock-data';

export async function GET(_request: NextRequest, { params }: { params: { path: string[] } }) {
  const resource = params.path[0];
  const data = resource === 'contacts' ? contacts : resource === 'sessions' ? sessions : resource === 'messages' ? messages : resource === 'cards' ? cards : null;
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(data);
}
