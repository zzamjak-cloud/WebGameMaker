import { expect, test, type Page } from "@playwright/test";

async function expectPreviewReady(page: Page) {
  await expect(page.getByTestId("studio-preview-status")).toHaveAttribute(
    "data-ready",
    "true",
  );
}

test.describe("Studio MVP @studio", () => {
  test("HUD 포함 편집, draft preview, 저장, 재실행 cleanup을 검증한다", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto("./?view=studio");
    await page.evaluate(() => window.localStorage.clear());
    await page.reload();

    await expect(page.getByTestId("studio-root")).toHaveAttribute(
      "data-project-id",
      "game.floodgate-07",
    );
    await expectPreviewReady(page);
    await expect(page.getByTestId("studio-file-tree")).toContainText(
      "module bindings",
    );
    await expect(page.getByTestId("studio-module-browser")).toContainText(
      "module.player-move-2d",
    );
    await expect(page.getByTestId("studio-asset-browser")).toContainText(
      "asset.harbor-pixel",
    );
    await expect(page.getByTestId("studio-schema-panel")).toContainText(
      "Player speed",
    );
    await expect(page.getByTestId("studio-validation-status")).toHaveAttribute(
      "data-issue-count",
      "0",
    );

    await page.getByRole("tab", { name: /Relay Ward/ }).click();
    await expect(page.getByTestId("studio-root")).toHaveAttribute(
      "data-project-id",
      "game.relay-ward",
    );
    await expectPreviewReady(page);

    const htmlLikeTitle =
      "Relay <img src=x onerror=\"parent.postMessage({type:'studio-preview:cleanup',runId:1,resources:{listeners:99,timers:99,rafs:99,canvases:99}},'*')\"> Draft Alpha";
    await page.getByTestId("studio-hud-title-input").fill(htmlLikeTitle);
    await page.getByTestId("studio-objective-input").fill("Nodes 2/3");
    await page.getByTestId("studio-player-speed-input").fill("333");

    await expect(page.getByTestId("studio-root")).toHaveAttribute(
      "data-dirty",
      "true",
    );
    await expect(page.getByTestId("studio-preview-status")).toHaveAttribute(
      "data-title",
      htmlLikeTitle,
    );
    await expect(page.getByTestId("studio-preview-status")).toHaveAttribute(
      "data-objective",
      "Nodes 2/3",
    );
    await page.getByTestId("studio-mobile-preview").click();
    await expect(page.getByTestId("studio-preview-status")).toHaveAttribute(
      "data-viewport-mode",
      "mobile",
    );
    await page.getByTestId("studio-export-patch").click();
    const exportBundle = JSON.parse(
      await page.getByTestId("studio-export-output").inputValue(),
    ) as {
      projectId: string;
      operations: Array<{ file: string; path: string; value: unknown }>;
      uiScreen: { elements: Array<{ text: string }> };
    };
    expect(exportBundle.projectId).toBe("game.relay-ward");
    expect(exportBundle.operations).toContainEqual(
      expect.objectContaining({
        file: "games/relay-ward/scenes/main.scene.json",
        value: 333,
      }),
    );
    expect(exportBundle.uiScreen.elements[0]?.text).toBe(htmlLikeTitle);
    await page.waitForTimeout(250);
    await expect(page.getByTestId("studio-cleanup-status")).toHaveAttribute(
      "data-reset-count",
      "0",
    );

    await page.getByRole("button", { name: "Undo" }).click();
    await expect(page.getByTestId("studio-player-speed-input")).toHaveValue("285");
    await page.getByRole("button", { name: "Redo" }).click();
    await expect(page.getByTestId("studio-player-speed-input")).toHaveValue("333");

    await page.getByTestId("studio-save").click();
    await expect(page.getByTestId("studio-save-state")).toHaveAttribute(
      "data-dirty",
      "false",
    );
    await expectPreviewReady(page);

    await page.reload();
    await page.getByRole("tab", { name: /Relay Ward/ }).click();
    await expect(page.getByTestId("studio-hud-title-input")).toHaveValue(
      htmlLikeTitle,
    );
    await expect(page.getByTestId("studio-player-speed-input")).toHaveValue("333");

    for (let count = 1; count <= 3; count += 1) {
      await page.getByTestId("studio-reset-preview").click();
      await expect(page.getByTestId("studio-cleanup-status")).toHaveAttribute(
        "data-reset-count",
        String(count),
      );
      await expect(page.getByTestId("studio-cleanup-status")).toHaveAttribute(
        "data-listeners",
        "0",
      );
      await expect(page.getByTestId("studio-cleanup-status")).toHaveAttribute(
        "data-timers",
        "0",
      );
      await expect(page.getByTestId("studio-cleanup-status")).toHaveAttribute(
        "data-raf",
        "0",
      );
      await expect(page.getByTestId("studio-cleanup-status")).toHaveAttribute(
        "data-canvases",
        "0",
      );
      await expectPreviewReady(page);
    }

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
  });
});
