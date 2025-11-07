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

    // Cek siapa yang manggil
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
        { error: "Only ADMIN or CS may change member passwords" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const memberId = (body.memberId ?? "").toString();
    const newPassword = (body.newPassword ?? "").toString();

    if (!memberId || !newPassword) {
      return NextResponse.json(
        { error: "memberId and newPassword are required" },
        { status: 400 }
      );
    }

    // Pastikan member ada & tenant sama
    const { data: memberProfile, error: memberError } = await supabaseAdmin
      .from("profiles")
      .select("id, tenant_id, role")
      .eq("id", memberId)
      .maybeSingle();

    if (memberError || !memberProfile) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 404 }
      );
    }

    if (memberProfile.role !== "MEMBER") {
      return NextResponse.json(
        { error: "Target is not a member" },
        { status: 400 }
      );
    }

    if (memberProfile.tenant_id !== actorProfile.tenant_id) {
      return NextResponse.json(
        { error: "Cannot change password for different tenant" },
        { status: 403 }
      );
    }

    const { error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(memberId, {
        password: newPassword
      });

    if (updateError) {
      return NextResponse.json(
        { error: updateError.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("change-password error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
