export function getDb(locals: App.Locals): D1Database {
  return locals.runtime.env.DB;
}

export interface DbUser {
  id: number;
  email: string;
  check_schedule: string;
  created_at: string;
}

export interface DbSeries {
  id: number;
  asura_id: number;
  slug: string;
  title: string;
  cover_url: string | null;
  latest_chapter: number;
  last_checked: string | null;
}

export interface DbSubscription {
  id: number;
  user_id: number;
  series_id: number;
  created_at: string;
}
