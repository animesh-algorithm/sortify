import { test, expect } from "@playwright/test";
test("queued jobs can retry dispatch without discarding the saved selection", async ({
  page,
}) => {
  const commands: unknown[] = [];
  await page.route("**/api/**", async (route) => {
    if (route.request().method() === "PATCH") {
      commands.push(route.request().postDataJSON());
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json:
        new URL(route.request().url()).pathname === "/api/sources"
          ? []
          : {
              user: { name: "Listener" },
              publications: [],
              runs: [
                {
                  id: "queued-run",
                  status: "queued",
                  mode: "blend",
                  revision: 0,
                  approvedRevision: null,
                  error: null,
                  data: {
                    sources: [],
                    tracks: [],
                    suggestions: [],
                    enriched: 0,
                  },
                },
              ],
            },
    });
  });
  await page.goto("/app");
  await expect(page.getByText("Getting ready…")).toBeVisible();
  await page.getByRole("button", { name: "Retry start" }).click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toEqual({ action: "resume", revision: 0 });
  await expect(
    page.getByRole("button", { name: "Cancel", exact: true }),
  ).toBeVisible();
});
const track = {
  id: "0000000000000000000001",
  name: "A favorite song",
  artists: [{ id: "artist", name: "Favorite Artist" }],
  album: { id: "album", name: "A familiar album" },
  sources: ["liked"],
};
const extraTrack = {
  ...track,
  id: "0000000000000000000002",
  name: "Another favorite",
};
test("one-click reclustering and explicit import-all keep individual actions visible", async ({
  page,
}) => {
  let revision = 1;
  const commands: {
    action: string;
    suggestionIds?: string[];
    mode?: string;
  }[] = [];
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (route.request().method() === "PATCH") {
      const input = route.request().postDataJSON();
      commands.push(input);
      if (input.action === "recluster") revision++;
      await route.fulfill({ json: { ok: true } });
      return;
    }
    await route.fulfill({
      json:
        path === "/api/sources"
          ? []
          : {
              user: { name: "Listener" },
              publications: [],
              runs: [
                {
                  id: "review",
                  status: "ready",
                  mode: "groups",
                  revision,
                  approvedRevision: null,
                  error: null,
                  data: {
                    sources: [],
                    tracks: [track, extraTrack],
                    enriched: 2,
                    suggestions: [
                      {
                        id: "a",
                        name: "First",
                        selected: true,
                        trackIds: [track.id],
                      },
                      {
                        id: "b",
                        name: "Second",
                        selected: true,
                        trackIds: [extraTrack.id],
                      },
                    ],
                  },
                },
              ],
            },
    });
  });
  await page.goto("/app");
  await expect(
    page.getByRole("button", { name: "Add First to Spotify" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Add Second to Spotify" }),
  ).toBeVisible();
  expect(commands).toHaveLength(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByLabel("Reclustering mode")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Try another mix", exact: true })
    .click();
  await expect.poll(() => commands.length).toBe(1);
  expect(commands[0]).toEqual({
    action: "recluster",
    revision: 1,
    mode: "blend",
  });
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "Add all to Spotify" }).click();
  expect(commands).toHaveLength(1);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Add all to Spotify" }).click();
  await expect.poll(() => commands.length).toBe(2);
  expect(commands[1]).toEqual({
    action: "import",
    revision: 2,
    suggestionIds: ["a", "b"],
  });
});
for (const width of [375, 768, 1024, 1440])
  test(`guided flow at ${width}px`, async ({ page }) => {
    await page.clock.install();
    await page.setViewportSize({ width, height: 1000 });
    let run: Record<string, unknown> | null = null;
    let publications: unknown[] = [];
    const edits: { action: string; suggestionIds?: string[] }[] = [];
    await page.route("**/api/**", async (route) => {
      const path = new URL(route.request().url()).pathname;
      let body: unknown = {};
      if (path === "/api/state")
        body = {
          user: { name: "Listener" },
          runs: run ? [run] : [],
          publications,
        };
      else if (path === "/api/sources")
        body = [
          { id: "liked", name: "Liked Songs", count: 1 },
          { id: "owned", name: "My playlist", count: 12 },
        ];
      else if (path === "/api/runs") {
        run = {
          id: "run",
          mode: "groups",
          status: "queued",
          revision: 0,
          approvedRevision: null,
          error: null,
          data: {
            sources: [],
            tracks: [],
            suggestions: [],
            enriched: 0,
            skipped: 0,
            algorithm: "v1",
          },
        };
        body = { id: "run" };
      } else if (path === "/api/runs/run") {
        const input = route.request().postDataJSON();
        edits.push(input);
        if (input.action === "edit") {
          run!.data = {
            ...(run!.data as object),
            suggestions: input.suggestions,
          };
          run!.revision = Number(run!.revision) + 1;
          run!.approvedRevision = null;
        }
        if (input.action === "approve") run!.approvedRevision = run!.revision;
        if (input.action === "import") {
          run!.status = "ready";
          publications = [
            {
              id: "op",
              runId: "run",
              suggestionId: input.suggestionIds[0],
              name: "My new mix",
              playlistId: "spotify-playlist",
              status: "complete",
              offset: 1,
              trackIds: [track.id],
            },
          ];
        }
        body = { ok: true };
      }
      await route.fulfill({ json: body });
    });
    await page.goto("/app");
    await page.getByText("Where should we look?").waitFor();
    await expect(page.getByRole("radio")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `outputs/sources-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel("Liked Songs").check();
    await page.getByRole("button", { name: "Rediscover my music" }).click();
    await expect(
      page.getByText("Getting ready to rediscover your music."),
    ).toBeVisible();
    run = {
      ...run!,
      status: "importing",
      data: {
        ...(run!.data as object),
        tracks: [track, extraTrack],
        enriched: 0,
      },
    };
    await page.clock.fastForward(10000);
    await expect(page.getByRole("status")).toContainText("2 songs gathered");
    await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);
    expect(
      await page.getByRole("progressbar").getAttribute("value"),
    ).toBeNull();
    run = {
      ...run!,
      status: "enriching",
      data: { ...(run!.data as object), enriched: 1 },
    };
    await page.clock.fastForward(10000);
    await expect(page.getByRole("status")).toContainText("1 song left");
    await expect(page.getByRole("progressbar")).toHaveAttribute("value", "1");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `outputs/progress-${width}.png`,
      fullPage: true,
    });
    run = {
      ...run!,
      status: "ready",
      revision: 1,
      data: {
        sources: [],
        tracks: [track, extraTrack],
        suggestions: [
          {
            id: "s",
            name: "Easy flow",
            selected: true,
            trackIds: [track.id, extraTrack.id],
          },
          {
            id: "t",
            name: "More from your library",
            selected: true,
            trackIds: [],
          },
        ],
        enriched: 1,
        skipped: 0,
        algorithm: "v1",
      },
    };
    await page.clock.fastForward(10000);
    await page.getByText("Find your next listen.").waitFor();
    await page.getByRole("button", { name: "Edit Easy flow playlist" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(
      page.getByRole("dialog").getByText("Another favorite", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Done reviewing" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page
      .getByLabel("Move A favorite song", { exact: true })
      .selectOption("t");
    await page
      .getByLabel("Move A favorite song", { exact: true })
      .selectOption("s");
    await page
      .getByRole("button", { name: "Remove Another favorite from Easy flow" })
      .click();
    await expect(
      page.getByRole("button", {
        name: "Remove Another favorite from Easy flow",
      }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Save changes" }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `outputs/review-${width}.png`,
      fullPage: true,
    });
    await page.getByLabel("Playlist 1 name").fill("My new mix");
    await page.getByLabel("Playlist 1 name").blur();
    await expect(
      page.getByRole("button", {
        name: "Add My new mix to Spotify",
        exact: true,
      }),
    ).toBeVisible();
    await page.getByLabel("Playlist 1 name").fill("My new mix revised");
    await page.getByLabel("Playlist 1 name").blur();
    await page
      .getByRole("button", {
        name: "Add My new mix revised to Spotify",
        exact: true,
      })
      .click();
    await expect(
      page.getByRole("link", { name: "Open in Spotify" }),
    ).toHaveAttribute(
      "href",
      "https://open.spotify.com/playlist/spotify-playlist",
    );
    expect(edits.filter((x) => x.action === "import")).toEqual([
      { action: "import", revision: 6, suggestionIds: ["s"] },
    ]);
    await expect(page.getByLabel("Playlist 1 name")).toBeDisabled();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `outputs/flow-${width}.png`,
      fullPage: true,
    });
  });
for (const width of [375, 768, 1024, 1440])
  test(`marketing page at ${width}px`, async ({ page }) => {
    let libraryRequests = 0;
    page.on("request", (request) => {
      if (
        request.url().includes("/api/state") ||
        request.url().includes("/api/sources")
      )
        libraryRequests++;
    });
    await page.clock.install();
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "The same twenty on repeat.",
    );
    for (const link of await page
      .getByRole("link", { name: "Rediscover my music" })
      .all())
      await expect(link).toHaveAttribute("href", "/api/spotify/connect");
    await expect(
      page.getByRole("link", { name: "Open Sortify" }),
    ).toHaveAttribute("href", "/app");
    await page
      .locator("summary")
      .filter({ hasText: "Will Sortify change my Liked Songs?" })
      .click();
    await expect(
      page.getByText("No. Your saved songs stay where they are.", {
        exact: false,
      }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth === innerWidth &&
          document.body.scrollWidth === innerWidth,
      ),
    ).toBe(true);
    expect(libraryRequests).toBe(0);
    await page.screenshot({
      path: `outputs/landing-${width}.png`,
      fullPage: true,
    });
  });
test("OAuth state cookie is httpOnly and callback rejects forged and replayed states", async ({
  request,
}) => {
  const start = await request.get("/api/spotify/connect", { maxRedirects: 0 });
  expect(start.status()).toBe(302);
  const location = new URL(start.headers().location);
  if (location.origin === "https://accounts.spotify.com") {
    const cookies = start.headers()["set-cookie"];
    expect(cookies).toContain("HttpOnly");
    expect(cookies).toContain("SameSite=lax");
    expect(cookies).toContain("Max-Age=600");
    expect(location.searchParams.get("state")!.length).toBeGreaterThan(40);
  } else {
    expect(location.origin).toBe("http://127.0.0.1:3000");
    expect(location.pathname).toBe("/app");
    expect(location.searchParams.get("error")).toMatch(
      /^(setup|database_setup|encryption_setup)$/,
    );
    expect(start.headers()["set-cookie"]).toBeUndefined();
  }
  const callback = await request.get(
    "/api/spotify/callback?state=forged&code=fake",
    { maxRedirects: 0 },
  );
  expect(callback.status()).toBe(302);
  expect(callback.headers()["set-cookie"]).toContain("sortify_oauth=");
  expect(callback.headers().location).toContain("/app?error=connect");
  const replay = await request.get(
    `/api/spotify/callback?state=${location.searchParams.get("state")}&code=fake`,
    { maxRedirects: 0 },
  );
  expect(replay.headers().location).toContain("error=connect");
  const state = await request.get("/api/state");
  expect((await state.json()).user).toBeNull();
  const write = await request.post("/api/runs", {
    headers: { Origin: new URL(callback.headers().location).origin },
    data: { sources: ["liked"], mode: "groups" },
  });
  expect(write.status()).toBe(401);
  const csrf = await request.post("/api/runs", {
    headers: { Origin: "https://evil.test" },
    data: { sources: ["liked"], mode: "groups" },
  });
  expect(csrf.status()).toBe(400);
});

test("remaining song count follows live progress", async ({ page }) => {
  await page.clock.install();
  let analyzed = 2;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json:
        path === "/api/state"
          ? {
              user: { name: "Listener" },
              publications: [],
              runs: [
                {
                  id: "timed-run",
                  status: "enriching",
                  mode: "groups",
                  revision: 0,
                  approvedRevision: null,
                  error: null,
                  data: {
                    sources: [],
                    tracks: Array.from({ length: 10 }, (_, i) => ({
                      ...track,
                      id: String(i),
                    })),
                    suggestions: [],
                    enriched: analyzed,
                  },
                },
              ],
            }
          : [{ id: "liked", name: "Liked Songs", count: 10 }],
    });
  });
  await page.goto("/app");
  await expect(page.getByRole("status")).toContainText("8 songs left");
  analyzed = 6;
  await page.clock.fastForward(10000);
  await expect(page.getByRole("status")).toContainText("4 songs left", {
    timeout: 5000,
  });
  await expect(page.getByRole("button", { name: "Resume" })).toHaveCount(0);
});

test("live playlist preview stays compact while work continues", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    await route.fulfill({
      json: path.endsWith("/preview")
        ? {
            checked: 50,
            suggestions: [
              {
                id: "calm",
                name: "Easy flow",
                selected: true,
                trackIds: [track.id],
              },
              {
                id: "bright",
                name: "Bright energy",
                selected: true,
                trackIds: [track.id, extraTrack.id],
              },
              {
                id: "third",
                name: "Late night",
                selected: true,
                trackIds: [track.id],
              },
              {
                id: "fourth",
                name: "Weekend",
                selected: true,
                trackIds: [extraTrack.id],
              },
              {
                id: "fifth",
                name: "Deep focus",
                selected: true,
                trackIds: [track.id, extraTrack.id],
              },
            ],
          }
        : path === "/api/sources"
          ? []
          : {
              user: { name: "Listener" },
              publications: [],
              runs: [
                {
                  id: "preview-run",
                  status: "enriching",
                  mode: "groups",
                  revision: 0,
                  approvedRevision: null,
                  error: null,
                  data: {
                    sources: [],
                    tracks: [track, extraTrack],
                    enriched: 1,
                    suggestions: [],
                  },
                },
              ],
            },
    });
  });
  await page.goto("/app");
  const preview = page.getByRole("region", { name: "Playlists taking shape" });
  await expect(preview).toContainText("50 songs checked");
  await expect(preview).toContainText("Easy flow");
  await expect(preview).toContainText("Bright energy");
  await expect(preview).toContainText(track.name);
  await expect(preview).toContainText(extraTrack.name);
  await expect(preview).toContainText("Deep focus");
  await expect(
    preview
      .getByRole("list", { name: "Bright energy songs" })
      .getByRole("listitem"),
  ).toHaveCount(2);
  await preview
    .getByRole("button", { name: "View all 2 songs" })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Bright energy" }),
  ).toBeVisible();
  await expect(dialog).toContainText(track.name);
  await expect(dialog).toContainText(extraTrack.name);
  const closeButton = dialog.getByRole("button", { name: "Close playlist" });
  expect(
    await closeButton.evaluate((button) => {
      const icon = button.querySelector("svg")!.getBoundingClientRect();
      const bounds = button.getBoundingClientRect();
      return Math.max(
        Math.abs(icon.x + icon.width / 2 - (bounds.x + bounds.width / 2)),
        Math.abs(icon.y + icon.height / 2 - (bounds.y + bounds.height / 2)),
      );
    }),
  ).toBeLessThan(1);
  await closeButton.click();
  await expect(dialog).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("state polling stops once a job finishes instead of rereading idle history", async ({
  page,
}) => {
  let reads = 0;
  await page.clock.install();
  await page.route("**/api/**", async (route) => {
    if (new URL(route.request().url()).pathname === "/api/sources") {
      await route.fulfill({ json: [] });
      return;
    }
    reads++;
    await route.fulfill({
      json: {
        user: { name: "Listener" },
        publications: [],
        runs: [
          {
            id: "polling-run",
            status: reads === 1 ? "queued" : "ready",
            mode: "blend",
            revision: 0,
            approvedRevision: null,
            error: null,
            data: { sources: [], tracks: [], suggestions: [], enriched: 0 },
          },
        ],
      },
    });
  });
  await page.goto("/app");
  await expect(page.getByText("Getting ready…")).toBeVisible();
  expect(reads).toBe(1);
  await page.clock.fastForward(9000);
  expect(reads).toBe(1);
  await page.clock.fastForward(1000);
  await expect.poll(() => reads).toBe(2);
  await expect(page.getByText("Getting ready…")).not.toBeVisible();
  await page.clock.fastForward(60000);
  expect(reads).toBe(2);
});
