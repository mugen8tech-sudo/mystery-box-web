import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(req: NextRequest) {
  try {
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");

    if (!authHeader || !authHeader.toLowerCase().startsWith("bearer ")) {
      return NextResponse.json(
        { error: "Missing or invalid Authorization header" },
        { status: 401 }
      );
    }

    const accessToken = authHeader.slice("Bearer ".length).trim();

    // Cek siapa yang manggil (Admin/CS)
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !userData?.user) {
      return NextResponse.json(
        { error: "Invalid or expired token" },
        { status: 401 }
      );
    }

    const actorId = userData.user.id;

    const { data: actorProfile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("tenant_id, role")
      .eq("id", actorId)
      .maybeSingle();

    if (profileError || !actorProfile) {
      return NextResponse.json(
        { error: "Actor profile not found" },
        { status: 400 }
      );
    }

    if (!actorProfile.tenant_id) {
      return NextResponse.json(
        { error: "Actor is not attached to a tenant" },
        { status: 400 }
      );
    }

    if (actorProfile.role !== "ADMIN" && actorProfile.role !== "CS") {
      return NextResponse.json(
        { error: "Only ADMIN or CS may create members" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const rawUsername = (body.username ?? "").toString().trim();
    const rawPassword = (body.password ?? "").toString();
    const initialCredit = Number(body.initialCredit ?? 0);

    if (!rawUsername) {
      return NextResponse.json(
        { error: "Username is required" },
        { status: 400 }
      );
    }
    if (!rawPassword) {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    if (!Number.isFinite(initialCredit) || initialCredit < 0) {
      return NextResponse.json(
        { error: "Initial credit must be 0 or positive number" },
        { status: 400 }
      );
    }

    const username = rawUsername.toLowerCase();
    const email = `${username}@member.local`;

    // Username unik per tenant?
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("tenant_id", actorProfile.tenant_id)
      .eq("username", username)
      .maybeSingle();

    if (existingError) {
      return NextResponse.json(
        { error: "Failed to check existing username" },
        { status: 500 }
      );
    }

    if (existing) {
      return NextResponse.json(
        { error: "Username sudah dipakai di tenant ini" },
        { status: 400 }
      );
    }

    // 1) Buat auth user
    const { data: created, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password: rawPassword,
        email_confirm: true
      });

    if (createError || !created?.user) {
      return NextResponse.json(
        { error: createError?.message || "Failed to create auth user" },
        { status: 400 }
      );
    }

    const memberId = created.user.id;

    // 2) Insert profile
    const { data: newProfile, error: insertError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: memberId,
        tenant_id: actorProfile.tenant_id,
        role: "MEMBER",
        username,
        credit_balance: 0
      })
      .select("id, username, credit_balance, created_at")
      .single();

    if (insertError || !newProfile) {
      return NextResponse.json(
        { error: insertError?.message || "Failed to insert profile" },
        { status: 400 }
      );
    }

    let balance = newProfile.credit_balance;

    if (initialCredit > 0) {
      const { data: topupData, error: topupError } = await supabaseAdmin.rpc(
        "perform_credit_topup",
        {
          p_member_id: memberId,
          p_amount: initialCredit,
          p_description: "Initial credit from panel"
        }
      );

      if (!topupError && Array.isArray(topupData) && topupData[0]?.new_balance) {
        balance = topupData[0].new_balance as number;
      }
    }

    return NextResponse.json({
      member: {
        id: newProfile.id,
        username: newProfile.username,
        credit_balance: balance,
        created_at: newProfile.created_at
      },
      email
    });
  } catch (err) {
    console.error("create-member error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
