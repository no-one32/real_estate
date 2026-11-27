import { cookies } from "next/headers";
import { createServerSupabase } from "@/lib/supabase/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { VIEW_AS_COOKIE } from "@/lib/view-as";
import { NextResponse } from "next/server";

/** Who the client dashboard works for. `viewAs` is set when an admin entered this client's portal. */
export type ClientUser = { id: string; email?: string };

export async function requireClient() {
  const supabase = await createServerSupabase();
  if (!supabase) {
    return { ok: false as const, response: NextResponse.json({ error: "Supabase is not configured" }, { status: 503 }) };
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data } = await supabase.from("profiles").select("role, full_name").eq("id", user.id).maybeSingle();
  if (data?.role === "client") {
    return { ok: true as const, supabase, user: { id: user.id, email: user.email } as ClientUser, profile: data, viewAs: null };
  }

  // an admin inside a client's portal: everything works as that client
  if (data?.role === "admin") {
    const target = (await cookies()).get(VIEW_AS_COOKIE)?.value;
    const service = createServiceSupabase();
    if (target && service) {
      const { data: client } = await service.from("profiles").select("id, role, full_name, email").eq("id", target).maybeSingle();
      if (client?.role === "client") {
        return {
          ok: true as const,
          supabase,
          user: { id: client.id as string, email: (client.email as string | null) ?? undefined } as ClientUser,
          profile: { role: "client", full_name: client.full_name as string | null },
          viewAs: { adminId: user.id, adminName: data.full_name || user.email || "Admin" },
        };
      }
    }
  }
  return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
}
