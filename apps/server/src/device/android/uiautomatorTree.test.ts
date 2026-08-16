import { describe, expect, it } from "vitest";
import { parseUiautomatorXml } from "./uiautomatorTree";

const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<hierarchy rotation="0">
  <node index="0" text="" resource-id="" class="android.widget.FrameLayout" content-desc="" checkable="false" checked="false" bounds="[0,0][1080,2340]">
    <node index="0" text="Save meal" resource-id="com.example:id/save" class="android.widget.Button" content-desc="Save the meal" checkable="false" checked="false" bounds="[110,2090][970,2222]" />
    <node index="1" text="" resource-id="" class="android.widget.Switch" content-desc="Dark mode" checkable="true" checked="true" bounds="[880,440][1040,530]" />
  </node>
</hierarchy>`;

describe("parseUiautomatorXml", () => {
  it("maps nodes to DeviceUiNode in device points", () => {
    const root = parseUiautomatorXml(XML, 2.75);
    expect(root.role).toBe("FrameLayout");
    expect(root.children).toHaveLength(2);

    const button = root.children[0];
    expect(button?.role).toBe("Button");
    expect(button?.label).toBe("Save the meal");
    expect(button?.value).toBe("Save meal");
    expect(button?.frame).toEqual({ x: 40, y: 760, width: 313, height: 48 });

    const toggle = root.children[1];
    expect(toggle?.role).toBe("Switch");
    expect(toggle?.value).toBe("1");
  });
});
