#!/bin/bash
# ============================================================
#  מסלול ההצטרפות, מקצה לקצה
#
#  כל דרך שבן משפחה יכול להגיע ממנה מקישור אל תוך האפליקציה,
#  כולל הדרכים שצריכות להיכשל. נבדק מול הסכימה האמיתית.
#
#  דורש Postgres מקומי עם schema.sql טעונה ובתוכה auth.uid()
#  ו-auth.users. אין לזה מה לרוץ מול המסד החי — הוא כותב ומוחק.
#
#  שימוש:  PGHOST=... PGPORT=... DB=journey bash docs/tests/invite-journey.sh
# ============================================================
: "${DB:=journey}"
: "${PGUSER:=postgres}"
export PGUSER
fail=0
T() { if [ "$2" = "$3" ]; then echo "PASS  $1"; else echo "FAIL  $1 — expected [$2] got [$3]"; fail=1; fi; }

q()  { psql -d $DB -tAc "$1" | tail -1; }
# Run something as a signed-in account, printing either the result or the error code.
asu() { # uuid sql
  psql -d $DB -tAc "set role authenticated;
    set \"request.jwt.claims\" = '{\"sub\":\"$1\",\"role\":\"authenticated\"}';
    $2" 2>&1 | tail -1
}
errcode() { # uuid sql  -> the SQLSTATE, via a trap
  psql -d $DB -tAc "set role authenticated;
    set \"request.jwt.claims\" = '{\"sub\":\"$1\",\"role\":\"authenticated\"}';
    do \$\$ begin $2; raise notice '%', 'OK'; exception when others then raise notice '%', SQLSTATE; end \$\$;" 2>&1 |
    grep -oE "NOTICE:  [0-9A-Z]{2,5}" | tail -1 | awk '{print $2}'
}

MASHA=11111111-1111-1111-1111-111111111111
YONI=22222222-2222-2222-2222-222222222222
SHANI=33333333-3333-3333-3333-333333333333
STRANGER=99999999-9999-9999-9999-999999999999

psql -q -d $DB <<SQL >/dev/null
truncate households cascade;
delete from auth.users;
insert into auth.users (id,email) values
 ('$MASHA','raido.co@gmail.com'), ('$YONI','yonatan@gmail.com'),
 ('$SHANI','shani@gmail.com'),    ('$STRANGER','stranger@gmail.com');
SQL

echo "=== 1. מאשה creates the household, then adds the family ==="
HH=$(asu $MASHA "select create_household('משפחת דובין','מאשה','#F7D6B9','1982-03-11');")
T "household created" 1 "$(q "select count(*) from households")"
psql -q -d $DB -c "insert into members (household_id, display_name, role, birth_date)
  select '$HH'::uuid,'יונתן','child'::member_role,'2011-01-09'::date
  union all select '$HH'::uuid,'שני','child'::member_role,'2016-02-20'::date" >/dev/null
T "three members, two of them unlinked" 2 "$(q "select count(*) from members where user_id is null")"

mkinvite() { psql -d $DB -tAc "insert into household_invites (household_id, member_id)
  select '$HH', id from members where display_name='$1' returning token" | head -1; }

echo
echo "=== 2. יונתן opens his link on his own account ==="
TOK_Y=$(mkinvite 'יונתן')
asu $YONI "select claim_invite('$TOK_Y','יונתן');" >/dev/null
T "יונתן is now linked to his own row" "$YONI" "$(q "select user_id from members where display_name='יונתן'")"
T "and to nobody else's" 1 "$(q "select count(*) from members where user_id='$YONI'")"
T "the invite is spent" "BURNT" "$(q "select case when used_at is null then 'valid' else 'BURNT' end from household_invites where token='$TOK_Y'")"

echo
echo "=== 3. the reported failure: שני taps her link on a phone signed in as מאשה ==="
TOK_S=$(mkinvite 'שני')
T "refused with the code that means 'wrong account', not 'slot taken'" \
  "P0003" "$(errcode $MASHA "perform claim_invite('$TOK_S','שני')")"
T "her link still works afterwards" "valid" "$(q "select case when used_at is null then 'valid' else 'BURNT' end from household_invites where token='$TOK_S'")"
T "and her row is untouched" "" "$(q "select coalesce(user_id::text,'') from members where display_name='שני'")"

echo
echo "=== 4. שני switches to her own account and retries the same link ==="
asu $SHANI "select claim_invite('$TOK_S','שני');" >/dev/null
T "שני is linked to her own row" "$SHANI" "$(q "select user_id from members where display_name='שני'")"
T "everyone is in exactly once" 0 "$(q "select count(*) from (select user_id from members where user_id is not null group by user_id having count(*)>1) d")"

echo
echo "=== 5. יונתן clicks a fresh link for his OWN row, a second time ==="
TOK_2=$(mkinvite 'יונתן')
CODE=$(errcode $YONI "perform claim_invite('$TOK_2','יונתן')")
echo "     -> $CODE"
T "he is already in the house, so this must not read as an error" "OK" "$CODE"

echo
echo "=== 5b. but מאשה on someone ELSE's link must still be refused ==="
TOK_3=$(mkinvite 'שני')
T "the shared-device case is still caught" "P0003" "$(errcode $MASHA "perform claim_invite('$TOK_3','שני')")"
T "and that link survives" "valid" "$(q "select case when used_at is null then 'valid' else 'BURNT' end from household_invites where token='$TOK_3'")"

echo
echo "=== 6. a stranger with a leaked link ==="
TOK_X=$(mkinvite 'יונתן')
T "the slot is gone, and says so" "23505" "$(errcode $STRANGER "perform claim_invite('$TOK_X','גנב')")"

echo
echo "=== 7. an expired link ==="
psql -q -d $DB -c "update household_invites set expires_at = now() - interval '1 day' where token='$TOK_X'" >/dev/null
T "expired links are refused" "22023" "$(errcode $STRANGER "perform claim_invite('$TOK_X','גנב')")"

echo
echo "=== 8. once in, יונתן sees the household — but only his part of it ==="
psql -q -d $DB <<SQL >/dev/null
insert into events (household_id, kind, title, starts_at) values
 ('$HH','holiday','ראש השנה', now() + interval '30 days'),
 ('$HH','general','ארוחה אצל סבתא', now() + interval '3 days'),
 ('$HH','appointment','תור לרופא — מאשה', now() + interval '5 days');
insert into appointments (event_id, patient_id)
 select e.id, m.id from events e, members m
  where e.title='תור לרופא — מאשה' and m.display_name='מאשה';
insert into event_participants (event_id, member_id)
 select e.id, m.id from events e, members m
  where e.title='ארוחה אצל סבתא' and m.display_name='יונתן';
SQL
T "מאשה sees all three" 3 "$(asu $MASHA "select count(*) from events where title in ('ראש השנה','ארוחה אצל סבתא','תור לרופא — מאשה')")"
T "יונתן sees the holiday and the dinner he is in, not the appointment" 2 "$(asu $YONI "select count(*) from events where title in ('ראש השנה','ארוחה אצל סבתא','תור לרופא — מאשה')")"
T "שני sees the holiday only — the dinner is marked for יונתן" 1 "$(asu $SHANI "select count(*) from events where title in ('ראש השנה','ארוחה אצל סבתא','תור לרופא — מאשה')")"
T "and the stranger sees nothing at all" 0 "$(asu $STRANGER "select count(*) from events where title in ('ראש השנה','ארוחה אצל סבתא','תור לרופא — מאשה')")"

echo
[ $fail = 0 ] && echo "the whole journey holds" || echo "FAILURES"
exit $fail
