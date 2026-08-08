CREATE OR REPLACE FUNCTION public.notify_email_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  payload jsonb;
  edge_function_url text := 'https://pnohfokjlhpzrkczruju.supabase.co/functions/v1/db-email-trigger';
BEGIN
  payload := jsonb_build_object(
    'type', TG_OP,
    'table', TG_TABLE_NAME,
    'record', row_to_json(NEW),
    'old_record', CASE WHEN TG_OP = 'UPDATE' THEN row_to_json(OLD) ELSE NULL END
  );

  PERFORM net.http_post(
    url := edge_function_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Email trigger failed: %', SQLERRM;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Ensure triggers exist
DROP TRIGGER IF EXISTS trigger_new_ticket_email ON public.support_tickets;
CREATE TRIGGER trigger_new_ticket_email
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_email_on_insert();

DROP TRIGGER IF EXISTS trigger_support_reply_email ON public.support_messages;
CREATE TRIGGER trigger_support_reply_email
  AFTER INSERT ON public.support_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_email_on_insert();

DROP TRIGGER IF EXISTS trigger_welcome_email ON public.profiles;
CREATE TRIGGER trigger_welcome_email
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_email_on_insert();