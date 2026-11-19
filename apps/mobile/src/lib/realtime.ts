/**
 * One shared realtime channel per store, however many screens use it.
 *
 * Supabase hands back the same channel when a topic is already open, and adding listeners to a
 * channel that has already subscribed throws. Today and Tasks both use the tasks store, so opening a
 * channel per screen crashed the app as soon as a second screen mounted. Here the first screen opens
 * the channel, later ones share it, and the last one to leave closes it. Each opening gets a fresh
 * topic name, so a channel that is still closing can never be handed back.
 */
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from './supabase';

type Shared = { channel: RealtimeChannel; users: number };
const open = new Map<string, Shared>();
let opened = 0;

export function watchTables(name: string, tables: readonly string[], onChange: () => void): () => void {
  const client = supabase;
  if (!client) return () => {};
  let shared = open.get(name);
  if (!shared) {
    opened += 1;
    let channel = client.channel(`${name}_${opened}`);
    for (const table of tables) channel = channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => onChange());
    channel.subscribe();
    shared = { channel, users: 0 };
    open.set(name, shared);
  }
  shared.users += 1;
  const mine = shared;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    mine.users -= 1;
    if (mine.users === 0 && open.get(name) === mine) {
      open.delete(name);
      void client.removeChannel(mine.channel);
    }
  };
}
