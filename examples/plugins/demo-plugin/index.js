/**
 * demo-plugin —— 三层插件化演示插件（纯 JS，无需构建）。
 *
 * 安装：把 examples/plugins/demo-plugin 整个目录复制到
 *       ~/.pi/agent/pi-web/plugins/ 下，刷新页面即生效（5 秒内热更新）。
 *
 * 演示内容：
 *  1. 位置级：sidebar-bottom 显示会话数统计面板；tabbar-right 放一个按钮
 *  2. 组件级：覆盖 ModelSelector（显示"插件版模型选择器"占位）
 *  3. 内容级：注册 demo-card 自定义消息渲染器（配合扩展 pi.sendMessage）
 *
 * 插件可用全局：window.robopi（注册 API）、window.React（React 19）
 */
(function () {
  "use strict";

  var React = window.React;
  var robopi = window.robopi;
  if (!React || !robopi) return;

  var h = React.createElement;

  // ============ 第 1 层：位置级 slot ============

  // sidebar-bottom：会话统计面板（异步获取 /api/sessions）
  robopi.registerSlot("sidebar-bottom", function (api) {
    return h("div", {
      style: {
        margin: "8px 10px",
        padding: "10px 12px",
        borderRadius: 10,
        border: "1px solid var(--border)",
        background: "var(--tool-bg)",
        fontSize: 12,
        color: "var(--text-muted)",
      },
    }, h(SessionCountPanel, { api: api }));
  });

  function SessionCountPanel(props) {
    var state = React.useState(null);
    var count = state[0];
    var setCount = state[1];
    React.useEffect(function () {
      props.api.listSessions().then(function (data) {
        setCount((data && data.sessions ? data.sessions.length : 0));
      });
    }, []);
    return h("div", null,
      h("div", { style: { fontWeight: 600, color: "var(--text)" } },
        "\uD83D\uDCCB 会话数：", count === null ? "…" : count),
      h("div", null, "来自 demo-plugin（位置级 slot）"));
  }

  // tabbar-right：一个按钮（打开插件说明）
  robopi.registerSlot("tabbar-right", function () {
    return h("button", {
      type: "button",
      title: "demo-plugin",
      onClick: function () { window.alert("RoboPi 插件系统演示插件已加载 ✅"); },
      style: {
        alignSelf: "center",
        marginRight: 8,
        border: "1px solid var(--border)",
        background: "var(--bg)",
        color: "var(--text)",
        borderRadius: 6,
        padding: "2px 8px",
        fontSize: 12,
        cursor: "pointer",
      },
    }, "\u2699\uFE0F 演示");
  });

  // ============ 第 2 层：组件级覆盖 ============

  robopi.registerComponent("ModelSelector", function () {
    return function PluginModelSelector() {
      return h("div", {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "4px 10px",
          borderRadius: 8,
          border: "1px dashed var(--accent)",
          color: "var(--accent)",
          fontSize: 13,
          background: "color-mix(in srgb, var(--accent) 8%, var(--bg))",
        },
      }, "\uD83E\uDDE0 插件版模型选择器（覆盖自 demo-plugin）");
    };
  });

  // ============ 第 3 层：消息渲染器 ============

  robopi.registerMessageRenderer("demo-card", function (message, api) {
    var text = "";
    try {
      var content = message && message.message && message.message.content;
      if (typeof content === "string") text = content;
      else if (Array.isArray(content)) {
        text = content.map(function (b) { return b && b.text ? b.text : ""; }).join("");
      }
    } catch (e) { text = String(message); }
    return h("div", {
      style: {
        margin: "8px 0",
        padding: "10px 14px",
        borderRadius: 10,
        border: "1px solid color-mix(in srgb, var(--accent) 40%, var(--border))",
        background: "color-mix(in srgb, var(--accent) 6%, var(--bg))",
        fontSize: 13,
        color: "var(--text)",
      },
    }, h("div", { style: { fontWeight: 700, marginBottom: 4 } }, "\uD83D\uDCCB demo-card"),
      h("div", null, text || "（空内容）"));
  });

  console.log("[demo-plugin] loaded ✅ (slots + component + messageRenderer)");
})();
