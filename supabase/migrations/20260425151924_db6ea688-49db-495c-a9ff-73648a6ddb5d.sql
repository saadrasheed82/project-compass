-- ============ ROLES ============
CREATE TYPE public.app_role AS ENUM ('teacher', 'student');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users can view their own roles" ON public.user_roles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Teachers can view all roles" ON public.user_roles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'));

-- ============ PROFILES ============
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "Teachers view all profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name', NEW.email);
  -- Default to student role; teachers seeded manually
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'student');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ GROUPS ============
CREATE TABLE public.groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 4,
  invite_code TEXT NOT NULL UNIQUE DEFAULT substring(md5(random()::text), 1, 8),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, user_id),
  UNIQUE (user_id)
);
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's group
CREATE OR REPLACE FUNCTION public.current_user_group()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT group_id FROM public.group_members WHERE user_id = auth.uid() LIMIT 1
$$;

CREATE POLICY "Teachers manage groups" ON public.groups
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Students view all groups" ON public.groups
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers manage group members" ON public.group_members
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Students view their group members" ON public.group_members
  FOR SELECT TO authenticated USING (group_id = public.current_user_group() OR user_id = auth.uid());
CREATE POLICY "Students join via invite" ON public.group_members
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ============ PROJECT PROPOSALS ============
CREATE TYPE public.proposal_status AS ENUM ('pending', 'approved', 'rejected');

CREATE TABLE public.project_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  status proposal_status NOT NULL DEFAULT 'pending',
  feedback TEXT,
  document_path TEXT,
  submitted_by UUID REFERENCES auth.users(id),
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.project_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage proposals" ON public.project_proposals
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Students view own group proposal" ON public.project_proposals
  FOR SELECT TO authenticated USING (group_id = public.current_user_group());
CREATE POLICY "Students insert own group proposal" ON public.project_proposals
  FOR INSERT TO authenticated WITH CHECK (group_id = public.current_user_group() AND submitted_by = auth.uid());
CREATE POLICY "Students update own group proposal" ON public.project_proposals
  FOR UPDATE TO authenticated USING (group_id = public.current_user_group() AND status = 'rejected');

-- ============ MONTHLY TASKS ============
CREATE TABLE public.monthly_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  month_number INT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (group_id, month_number)
);
ALTER TABLE public.monthly_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers view all tasks" ON public.monthly_tasks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Students view own group tasks" ON public.monthly_tasks
  FOR SELECT TO authenticated USING (group_id = public.current_user_group());
CREATE POLICY "System inserts tasks" ON public.monthly_tasks
  FOR INSERT TO authenticated WITH CHECK (
    group_id = public.current_user_group() OR public.has_role(auth.uid(), 'teacher')
  );

-- ============ TASK SUBMISSIONS ============
CREATE TYPE public.submission_status AS ENUM ('pending', 'verified', 'rejected');

CREATE TABLE public.task_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.monthly_tasks(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE NOT NULL,
  submitted_by UUID REFERENCES auth.users(id) NOT NULL,
  screenshot_path TEXT,
  video_path TEXT,
  notes TEXT,
  status submission_status NOT NULL DEFAULT 'pending',
  feedback TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.task_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage submissions" ON public.task_submissions
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Students view own group submissions" ON public.task_submissions
  FOR SELECT TO authenticated USING (group_id = public.current_user_group());
CREATE POLICY "Students insert own submissions" ON public.task_submissions
  FOR INSERT TO authenticated WITH CHECK (group_id = public.current_user_group() AND submitted_by = auth.uid());

-- ============ ANNOUNCEMENTS ============
CREATE TABLE public.announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  group_id UUID REFERENCES public.groups(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers manage announcements" ON public.announcements
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "Students view targeted announcements" ON public.announcements
  FOR SELECT TO authenticated USING (group_id IS NULL OR group_id = public.current_user_group());

-- ============ STORAGE BUCKETS ============
INSERT INTO storage.buckets (id, name, public) VALUES
  ('proposals', 'proposals', false),
  ('submissions', 'submissions', false);

CREATE POLICY "Authed read proposals" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'proposals');
CREATE POLICY "Authed upload proposals" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'proposals' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Authed read submissions" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'submissions');
CREATE POLICY "Authed upload submissions" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'submissions' AND (storage.foldername(name))[1] = auth.uid()::text);

-- ============ PROGRESS HELPER ============
CREATE OR REPLACE FUNCTION public.group_progress(_group_id UUID)
RETURNS NUMERIC LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN (SELECT COUNT(*) FROM public.monthly_tasks WHERE group_id = _group_id) = 0 THEN 0
    ELSE ROUND(
      100.0 * (SELECT COUNT(DISTINCT s.task_id) FROM public.task_submissions s
               JOIN public.monthly_tasks t ON t.id = s.task_id
               WHERE t.group_id = _group_id AND s.status = 'verified')
      / (SELECT COUNT(*) FROM public.monthly_tasks WHERE group_id = _group_id),
      1
    )
  END
$$;