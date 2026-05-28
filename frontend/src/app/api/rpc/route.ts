import { NextRequest, NextResponse } from "next/server";

const RPC_URL = "https://rpc.xlayer.tech/";

async function fetchRpc(body: string, attempt = 1): Promise<Response> {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "fanovo-frontend/1.0",
    },
    body,
  });

  if (res.status === 429 && attempt < 3) {
    await new Promise((r) => setTimeout(r, 1000 * attempt));
    return fetchRpc(body, attempt + 1);
  }

  return res;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const res = await fetchRpc(body);
    const data = await res.text();

    return new NextResponse(data, {
      status: res.status,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { jsonrpc: "2.0", error: { code: -32603, message: String(err) }, id: null },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
