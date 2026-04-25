import { createClient } from "https://esm.sh/@supabase/supabase-js@2.104.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type DemoRole = "teacher" | "student";

const demoUsers: Record<DemoRole, { email: string; password: string; fullName: string }> = {
  teacher: {
    email: "teacher@projectpilot.demo",
    password: "DemoTeacher123!",
    fullName: "Demo Teacher",
  },
  student: {
    email: "student@projectpilot.demo",
    password: "DemoStudent123!",
    fullName: "Demo Student",
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { role = "teacher" } = (await req.json().catch(() => ({}))) as { role?: DemoRole };
    if (role !== "teacher" && role !== "student") {
      return new Response(JSON.stringify({ error: "Invalid demo role" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) throw new Error("Demo setup is not configured");

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const demo = demoUsers[role];
    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email: demo.email,
      password: demo.password,
      email_confirm: true,
      user_metadata: { full_name: demo.fullName },
    });

    let userId = created.user?.id;
    if (createError && !createError.message.toLowerCase().includes("already registered")) {
      throw createError;
    }

    if (!userId) {
      const { data: users, error: listError } = await admin.auth.admin.listUsers();
      if (listError) throw listError;
      userId = users.users.find((user) => user.email?.toLowerCase() === demo.email)?.id;
    }
    if (!userId) throw new Error("Could not prepare demo account");

    await admin.auth.admin.updateUserById(userId, {
      password: demo.password,
      email_confirm: true,
      user_metadata: { full_name: demo.fullName },
    });

    await admin.from("profiles").upsert({ id: userId, email: demo.email, full_name: demo.fullName });
    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("user_roles").insert({ user_id: userId, role });

    if (role === "student") {
      const { data: group, error: groupError } = await admin
        .from("groups")
        .upsert(
          { name: "Demo Group", capacity: 4, invite_code: "DEMO2026", created_by: null },
          { onConflict: "invite_code" },
        )
        .select("id")
        .single();
      if (groupError) throw groupError;
      await admin.from("group_members").upsert(
        { group_id: group.id, user_id: userId },
        { onConflict: "user_id" },
      );
    }

    return new Response(JSON.stringify({ email: demo.email, password: demo.password, role }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Demo login failed";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});