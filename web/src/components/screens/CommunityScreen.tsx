'use client';

import { useMemo, useState } from 'react';
import { ChromeLayout } from '../shared/Chrome';
import { Btn, Card } from '../shared/atoms';
import { useAuth } from '@/lib/firebase/auth-context';
import { recordActivity } from '@/lib/activity';
import { GROUP_ACTIVITY_IDEAS, MAX_IMAGE_ATTACHMENT_BYTES, SAMPLE_GROUPS } from '@/lib/sample-social';

export default function CommunityScreen() {
  const { user } = useAuth();
  const [activeGroupId, setActiveGroupId] = useState(SAMPLE_GROUPS[0]?.id ?? '');
  const [activeThreadId, setActiveThreadId] = useState(SAMPLE_GROUPS[0]?.threads[0]?.id ?? '');
  const [message, setMessage] = useState('');
  const [attachmentError, setAttachmentError] = useState('');
  const [joined, setJoined] = useState<Record<string, boolean>>({});

  const activeGroup = useMemo(
    () => SAMPLE_GROUPS.find((group) => group.id === activeGroupId) ?? SAMPLE_GROUPS[0],
    [activeGroupId]
  );
  const activeThread =
    activeGroup?.threads.find((thread) => thread.id === activeThreadId) ?? activeGroup?.threads[0];

  const joinGroup = async () => {
    if (!activeGroup || !user) return;
    setJoined((prev) => ({ ...prev, [activeGroup.id]: true }));
    await recordActivity(user, {
      type: 'group_join',
      title: `Joined ${activeGroup.name}`,
      resourceType: 'group',
      resourceId: activeGroup.id,
      visibility: 'private'
    });
  };

  const sendMessage = async () => {
    if (!message.trim() || !activeGroup || !user) return;
    await recordActivity(user, {
      type: 'chat_message',
      title: `Posted in ${activeGroup.name}`,
      resourceType: 'groupThread',
      resourceId: activeThread?.id ?? activeGroup.id,
      visibility: 'connections',
      metadata: { preview: message.slice(0, 120) }
    });
    setMessage('');
  };

  return (
    <ChromeLayout>
      <div className="px-5 py-6 lg:px-10 lg:py-8 max-w-[1500px]">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-900 lg:text-3xl">Community</h1>
          <p className="mt-1 text-[14px] text-slate-500">
            Role-aware educational groups, discussions, direct messages, and group chat foundations.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-12">
          <aside className="xl:col-span-3">
            <Card className="overflow-hidden">
              <div className="border-b border-slate-200 px-4 py-3">
                <div className="text-[13px] font-extrabold text-slate-900">Auto groups</div>
                <div className="text-[11px] text-slate-500">Grade + Subject + Language</div>
              </div>
              <div className="p-2">
                {SAMPLE_GROUPS.map((group) => (
                  <button
                    key={group.id}
                    onClick={() => {
                      setActiveGroupId(group.id);
                      setActiveThreadId(group.threads[0]?.id ?? '');
                    }}
                    className={`mb-1 w-full rounded-lg px-3 py-2 text-start transition ${
                      group.id === activeGroupId ? 'bg-sky-50 text-sky-800' : 'hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="text-[13px] font-bold">{group.name}</div>
                    <div className="text-[11px] text-slate-500">{group.memberCount} members</div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="mt-5 p-4">
              <div className="text-[13px] font-extrabold text-slate-900">Group activities</div>
              <div className="mt-3 space-y-2">
                {GROUP_ACTIVITY_IDEAS.map((idea) => (
                  <div key={idea} className="rounded-lg bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                    {idea}
                  </div>
                ))}
              </div>
            </Card>
          </aside>

          <main className="xl:col-span-6">
            <Card className="overflow-hidden">
              <div className="border-b border-slate-200 px-5 py-4">
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <h2 className="text-[18px] font-extrabold text-slate-900">{activeGroup?.name}</h2>
                    <p className="mt-1 text-[12px] text-slate-500">{activeGroup?.description}</p>
                  </div>
                  <Btn kind={joined[activeGroup?.id ?? ''] ? 'outline' : 'primary'} size="sm" className="ms-auto" onClick={joinGroup}>
                    {joined[activeGroup?.id ?? ''] ? 'Joined' : 'Join group'}
                  </Btn>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12">
                <div className="border-b border-slate-200 p-3 lg:col-span-4 lg:border-b-0 lg:border-e">
                  <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Threads</div>
                  {activeGroup?.threads.length ? activeGroup.threads.map((thread) => (
                    <button
                      key={thread.id}
                      onClick={() => setActiveThreadId(thread.id)}
                      className={`mb-2 w-full rounded-lg px-3 py-2 text-start ${
                        thread.id === activeThread?.id ? 'bg-slate-900 text-white' : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      <div className="text-[12px] font-bold">{thread.title}</div>
                      <div className="mt-1 text-[10.5px] opacity-70">{thread.replies} replies by {thread.author}</div>
                    </button>
                  )) : (
                    <div className="text-[12px] text-slate-500">No threads yet.</div>
                  )}
                </div>

                <div className="lg:col-span-8">
                  <div className="min-h-[420px] bg-slate-50/50 p-4">
                    {activeThread ? (
                      <div>
                        <div className="rounded-lg bg-white p-4 shadow-sm">
                          <div className="text-[15px] font-extrabold text-slate-900">{activeThread.title}</div>
                          <div className="mt-1 text-[12px] text-slate-500">Started by {activeThread.author}</div>
                          {activeThread.links.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {activeThread.links.map((link) => (
                                <a key={link} href={link} target="_blank" rel="noreferrer" className="rounded-md bg-sky-50 px-2 py-1 text-[11px] font-bold text-sky-700">
                                  Shared link
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="mt-4 space-y-3">
                          <ThreadMessage name="Teacher" text="Pin the current student-book page before the next revision session." />
                          <ThreadMessage name="Student" text="I reached chapter 4, page 88. The examples after ideal gas law need another walkthrough." />
                        </div>
                      </div>
                    ) : (
                      <div className="grid min-h-[320px] place-items-center text-[13px] text-slate-500">
                        Pick a thread or start a new discussion.
                      </div>
                    )}
                  </div>

                  <div className="border-t border-slate-200 bg-white p-3">
                    <div className="mb-2 flex items-center gap-2 text-[11px] text-slate-500">
                      <span>Only image attachments are allowed.</span>
                      <span className="font-mono">Max 2 MB</span>
                    </div>
                    <div className="flex items-end gap-2">
                      <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={2}
                        placeholder="Write a group message..."
                        className="min-h-11 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-500/20"
                      />
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        id="community-image"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          if (!file.type.startsWith('image/') || file.size > MAX_IMAGE_ATTACHMENT_BYTES) {
                            setAttachmentError('Image must be under 2 MB.');
                            e.target.value = '';
                          } else {
                            setAttachmentError('');
                          }
                        }}
                      />
                      <label htmlFor="community-image" className="inline-flex h-11 cursor-pointer items-center justify-center rounded-lg border border-slate-200 px-3 text-[13px] font-bold text-slate-600 hover:bg-slate-50">
                        Image
                      </label>
                      <Btn kind="primary" onClick={sendMessage} disabled={!message.trim()}>Send</Btn>
                    </div>
                    {attachmentError && <div className="mt-2 text-[12px] text-rose-600">{attachmentError}</div>}
                  </div>
                </div>
              </div>
            </Card>
          </main>

          <aside className="xl:col-span-3">
            <Card className="p-4">
              <div className="text-[13px] font-extrabold text-slate-900">Direct messaging</div>
              <div className="mt-3 space-y-2">
                {['Mona Abdelrahman', 'Omar Sherif', 'Nadia Samir'].map((name) => (
                  <button key={name} className="w-full rounded-lg bg-slate-50 px-3 py-2 text-start hover:bg-slate-100">
                    <div className="text-[12px] font-bold text-slate-800">{name}</div>
                    <div className="text-[11px] text-slate-500">Authorization-aware 1-to-1 chat</div>
                  </button>
                ))}
              </div>
            </Card>

            <Card className="mt-5 p-4">
              <div className="text-[13px] font-extrabold text-slate-900">Authorization layer</div>
              <div className="mt-3 space-y-2 text-[12px] text-slate-600">
                <div>Admins can moderate groups and assign group admins.</div>
                <div>Teachers can administer subject groups they own.</div>
                <div>Parents can message linked children and teachers.</div>
                <div>Students can join eligible groups and message authorized users.</div>
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </ChromeLayout>
  );
}

function ThreadMessage({ name, text }: { name: string; text: string }) {
  return (
    <div className="flex gap-3">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-slate-900 text-[12px] font-bold text-white">
        {name.slice(0, 1)}
      </div>
      <div className="min-w-0 flex-1 rounded-lg bg-white px-3 py-2 shadow-sm">
        <div className="text-[12px] font-bold text-slate-800">{name}</div>
        <div className="mt-0.5 text-[13px] text-slate-600">{text}</div>
      </div>
    </div>
  );
}

