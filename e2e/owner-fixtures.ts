import { mockLiveEvent } from './live-fixtures';
import { eventId } from './public-fixtures';

export async function mockOwner(page: import('@playwright/test').Page, lang: 'en' | 'ar' = 'ar') {
  await mockLiveEvent(page, { role: 'EVENT_ADMIN', lang });
  const member = {
    id: 'fixture-member',
    username: 'fixture_person',
    phone: '+201000000001',
    full_name_en: 'Fixture Person',
    full_name_ar: 'عضو تجريبي',
    system_role: 'MEMBER',
    is_active: true,
    has_login: true,
  };
  const event = {
    id: eventId,
    code: 'PLAY',
    name_en: 'Fixture Event',
    name_ar: 'حدث تجريبي',
    status: 'DRAFT',
    is_current: true,
    starts_on: null,
    admin_ids: [member.id],
  };
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').at(-1);
    if (!['get_my_profile', 'list_members', 'list_events'].includes(name!)) return route.fallback();
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': '*',
    };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
    const data =
      name === 'list_members'
        ? [member]
        : name === 'list_events'
          ? [event]
          : {
              ...member,
              system_role: 'OWNER',
              roles: [],
              assigned_games: [],
            };
    return route.fulfill({ json: data, headers });
  });
}
