import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { Lock, CheckCircle2, XCircle, Clock, Send, Megaphone, Sparkles } from "lucide-react";

interface Proposal {
  id: string; title: string; description: string; status: string; feedback: string | null;
}
interface Announcement { id: string; title: string; body: string; created_at: string; }

export default function Student() {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [groupName, setGroupName] = useState<string>("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: gm } = await supabase.from("group_members").select("group_id, groups(name)").maybeSingle();
    if (gm) {
      setGroupId(gm.group_id);
      setGroupName((gm as any).groups?.name ?? "");
      const { data: p } = await supabase
        .from("project_proposals").select("*").eq("group_id", gm.group_id).maybeSingle();
      setProposal(p as Proposal | null);
      if (p) { setTitle(p.title); setDesc(p.description); }
    }
    const { data: anns } = await supabase
      .from("announcements").select("*").order("created_at", { ascending: false }).limit(5);
    setAnnouncements(anns ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const submitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupId) return;
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    if (proposal) {
      const { error } = await supabase
        .from("project_proposals")
        .update({ title, description: desc, status: "pending", feedback: null })
        .eq("id", proposal.id);
      if (error) toast.error(error.message); else toast.success("Resubmitted for review");
    } else {
      const { error } = await supabase.from("project_proposals").insert({
        group_id: groupId, title, description: desc, submitted_by: u.user!.id,
      });
      if (error) toast.error(error.message); else toast.success("Proposal submitted");
    }
    setBusy(false);
    load();
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-pulse">Loading...</div></div>;

  if (!groupId) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader title="Student Portal" />
        <main className="container mx-auto py-12">
          <Alert>
            <AlertTitle>You're not in a group yet</AlertTitle>
            <AlertDescription>Ask your teacher for an invite link to join your group.</AlertDescription>
          </Alert>
        </main>
      </div>
    );
  }

  const approved = proposal?.status === "approved";

  return (
    <div className="min-h-screen bg-background">
      <AppHeader title="Student Portal" />
      <main className="container mx-auto py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-muted-foreground">Your group</p>
            <h2 className="text-2xl font-bold">{groupName}</h2>
          </div>
          {proposal && <StatusBadge status={proposal.status} />}
        </div>

        {/* Announcements */}
        {announcements.length > 0 && (
          <Card className="p-5 bg-gradient-card border-l-4" style={{ borderLeftColor: "hsl(var(--accent))" }}>
            <div className="flex items-center gap-2 mb-3">
              <Megaphone className="w-4 h-4 text-accent" />
              <h3 className="font-semibold">Latest announcements</h3>
            </div>
            <div className="space-y-3">
              {announcements.map((a) => (
                <div key={a.id} className="text-sm border-l-2 border-accent/40 pl-3">
                  <div className="font-medium">{a.title}</div>
                  <div className="text-muted-foreground">{a.body}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Proposal */}
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-1">Project Proposal</h3>
          <p className="text-sm text-muted-foreground mb-4">
            {proposal?.status === "approved" && "Approved! Your dashboard is unlocked below."}
            {proposal?.status === "rejected" && "Rejected — please update and resubmit."}
            {proposal?.status === "pending" && "Awaiting teacher review."}
            {!proposal && "Submit your project idea for teacher approval."}
          </p>

          {proposal?.status === "rejected" && proposal.feedback && (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Teacher feedback</AlertTitle>
              <AlertDescription>{proposal.feedback}</AlertDescription>
            </Alert>
          )}

          {(!proposal || proposal.status !== "approved") && (
            <form onSubmit={submitProposal} className="space-y-4">
              <div>
                <Label>Project title</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} required />
              </div>
              <div>
                <Label>Project description</Label>
                <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={6} required
                  placeholder="Describe your project goals, scope, and approach..." />
              </div>
              <Button type="submit" disabled={busy || proposal?.status === "pending"} className="bg-gradient-primary">
                <Send className="w-4 h-4 mr-1" />
                {proposal ? "Resubmit" : "Submit for review"}
              </Button>
            </form>
          )}

          {approved && (
            <div className="space-y-2">
              <div className="font-medium">{proposal!.title}</div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal!.description}</p>
            </div>
          )}
        </Card>

        {/* Roadmap (locked / unlocked) */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-semibold">AI Project Roadmap</h3>
            </div>
            {!approved && <Badge variant="secondary"><Lock className="w-3 h-3 mr-1" />Locked</Badge>}
          </div>
          {!approved ? (
            <div className="text-center py-12 text-muted-foreground">
              <Lock className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p>Your roadmap will unlock once your proposal is approved.</p>
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <p>🎉 Approved! AI roadmap generation & monthly task tracking arrives in the next update.</p>
              <Progress value={0} className="mt-4" />
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

const StatusBadge = ({ status }: { status: string }) => {
  if (status === "approved") return <Badge className="bg-success text-success-foreground"><CheckCircle2 className="w-3 h-3 mr-1" />Approved</Badge>;
  if (status === "rejected") return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
  return <Badge variant="secondary"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
};
