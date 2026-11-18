export const RENEW_MS = 2800;

export class AwakeControl {
  mode = "off";
  generation = 0;
  stop() {
    this.generation++;
    this.mode = "off";
  }

  reconcile(working) {
    if (this.mode === "agents" && !working) this.stop();
  }

  toggle(button, working) {
    if (button !== "left") this.reconcile(working);
    if (button === "left") {
      if (this.mode === "off") this.mode = "manual";
      else this.stop();
    } else if (this.mode === "agents") {
      this.stop();
    } else if (working) {
      this.mode = "agents";
    } else {
      return false;
    }
    return true;
  }

  async renew({ working, lease, sleep, failed }) {
    const generation = this.generation;
    const eligible = () => {
      if (generation !== this.generation || this.mode === "off") return false;
      this.reconcile(working());
      return this.mode !== "off";
    };
    const onFailure = error => {
      if (!eligible()) return;
      this.stop();
      failed(error);
    };
    while (eligible()) {
      // Start by the next refresh, not after the four-second process exits.
      void (async () => {
        try {
          const result = await lease();
          if (result.code === 0) return;
          throw new Error(result.stderr.trim() || `caffeinate exited ${result.code}`);
        } catch (error) {
          onFailure(error);
        }
      })();
      await sleep(RENEW_MS);
    }
  }
}
