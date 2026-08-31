"use client";

import { Suspense, lazy, useMemo } from "react";
import { useComponentOverride } from "@/lib/plugin-client";
import type { OverridableComponentName } from "@/lib/plugin-api";

/**
 * 组件级覆盖渲染器（ComponentRegistry）。
 *
 * 用法：
 *   <ComponentRegistry component="ChatInput" fallback={<DefaultChatInput />} />
 *
 * - 无插件覆盖 → 渲染 fallback（宿主默认组件，行为与 pi-web 一致）
 * - 插件注册了覆盖 → 异步加载插件组件（支持 lazy factory）
 */
export function ComponentRegistry({
  component,
  fallback,
}: {
  component: OverridableComponentName;
  fallback: React.ReactNode;
}) {
  const factory = useComponentOverride(component);
  const Override = useMemo(() => {
    if (!factory) return null;
    return lazy(async () => {
      const Comp = (await factory()) as React.ComponentType;
      return { default: Comp };
    });
  }, [factory]);

  if (!Override) return <>{fallback}</>;
  return (
    <Suspense fallback={<>{fallback}</>}>
      <Override />
    </Suspense>
  );
}
