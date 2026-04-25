CREATE OR REPLACE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.lookup_group_by_invite(_invite_code text)
RETURNS TABLE(id uuid, name text, capacity integer, member_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id,
    g.name,
    g.capacity,
    (SELECT COUNT(*) FROM public.group_members gm WHERE gm.group_id = g.id) AS member_count
  FROM public.groups g
  WHERE lower(g.invite_code) = lower(trim(_invite_code))
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.lookup_group_by_invite(text) TO anon, authenticated;