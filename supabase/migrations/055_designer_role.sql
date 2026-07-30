-- Add designer role to member_role enum.
-- Designers are external collaborators (architects, engineers, etc.) who can
-- receive and respond to RFIs but have limited access to the staff app.
alter type member_role add value if not exists 'designer' after 'accountant';
