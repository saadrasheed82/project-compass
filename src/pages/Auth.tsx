import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap, Sparkles } from "lucide-react";

export default function Auth() {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [params] = useSearchParams();
  const inviteCode = params.get("invite") ?? "";
  const [busy, setBusy] = useState(false);

  // signup
  const [name, setName] = useState("");
  const [emailS, setEmailS] = useState("");
  const [pwS, setPwS] = useState("");
  const [code, setCode] = useState(inviteCode);

  // login
  const [emailL, setEmailL] = useState("");
  const [pwL, setPwL] = useState("");

  useEffect(() => {
    if (!loading && user && role) {
      navigate(role === "teacher" ? "/teacher" : "/student", { replace: true });
    }
  }, [user, role, loading, navigate]);

  const signUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      // Validate invite code first
      const { data: group, error: gErr } = await supabase
        .from("groups")
        .select("id, name, capacity")
        .eq("invite_code", code.trim())
        .maybeSingle();
      if (gErr || !group) {
        toast.error("Invalid invite code. Ask your teacher for the correct code.");
        setBusy(false);
        return;
      }
      const { count } = await supabase
        .from("group_members")
        .select("*", { count: "exact", head: true })
        .eq("group_id", group.id);
      if ((count ?? 0) >= group.capacity) {
        toast.error(`Group "${group.name}" is full.`);
        setBusy(false);
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email: emailS,
        password: pwS,
        options: {
          emailRedirectTo: `${window.location.origin}/student`,
          data: { full_name: name },
        },
      });
      if (error) throw error;
      if (data.user) {
        const { error: jErr } = await supabase
          .from("group_members")
          .insert({ group_id: group.id, user_id: data.user.id });
        if (jErr) console.warn(jErr);
        toast.success(`Welcome! You've joined ${group.name}.`);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Signup failed");
    } finally {
      setBusy(false);
    }
  };

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: emailL, password: pwL });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-hero">
      <div className="w-full max-w-md">
        <div className="text-center mb-8 text-primary-foreground">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/15 backdrop-blur-sm mb-4 shadow-glow">
            <GraduationCap className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">ProjectPilot</h1>
          <p className="text-primary-foreground/80 mt-2 flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4" /> AI-powered project management for classrooms
          </p>
        </div>

        <Card className="p-6 shadow-elegant bg-gradient-card">
          <Tabs defaultValue={inviteCode ? "signup" : "login"}>
            <TabsList className="grid grid-cols-2 w-full mb-6">
              <TabsTrigger value="login">Login</TabsTrigger>
              <TabsTrigger value="signup">Sign up (Student)</TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <form onSubmit={signIn} className="space-y-4">
                <div>
                  <Label htmlFor="emailL">Email</Label>
                  <Input id="emailL" type="email" required value={emailL} onChange={(e) => setEmailL(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pwL">Password</Label>
                  <Input id="pwL" type="password" required value={pwL} onChange={(e) => setPwL(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary hover:opacity-90">
                  {busy ? "Signing in..." : "Login"}
                </Button>
              </form>
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={signUp} className="space-y-4">
                <div>
                  <Label htmlFor="code">Invite code</Label>
                  <Input id="code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="From your teacher" />
                </div>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="emailS">Email</Label>
                  <Input id="emailS" type="email" required value={emailS} onChange={(e) => setEmailS(e.target.value)} />
                </div>
                <div>
                  <Label htmlFor="pwS">Password</Label>
                  <Input id="pwS" type="password" required minLength={6} value={pwS} onChange={(e) => setPwS(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-primary hover:opacity-90">
                  {busy ? "Creating account..." : "Join group"}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="text-center text-xs text-primary-foreground/70 mt-6">
          Teachers: ask the admin to seed your account.
        </p>
      </div>
    </div>
  );
}
