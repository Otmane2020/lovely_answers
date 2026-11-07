
-- 1) site_audits: remove anonymous access to project_id IS NULL rows
DROP POLICY IF EXISTS "Users can view their project audits" ON public.site_audits;

CREATE POLICY "Users can view their project audits"
ON public.site_audits
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT projects.id FROM public.projects WHERE projects.user_id = auth.uid()
  )
);

-- 2) support-attachments: make private and scope reads to ticket owner / admins
DROP POLICY IF EXISTS "Anyone can view support attachments" ON storage.objects;

CREATE POLICY "Ticket owner or admin can read support attachments"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'support-attachments'
  AND (
    public.is_admin(auth.uid())
    OR (auth.uid())::text = (storage.foldername(name))[1]
  )
);
