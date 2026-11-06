import { createElement, useId, type ComponentType, type CSSProperties } from 'react';
import type { IconProps } from 'nucleo-glass';

export type AppIconProps = IconProps;
export type AppIcon = ComponentType<AppIconProps>;

/** 원본 Glass SVG를 재사용한다. 선 굵기 속성은 이전 호출부와의 호환을 위해 무시한다. */
export function glassIcon(Icon: ComponentType<IconProps & { uniqueId?: string }>): AppIcon {
  return function GlassIcon({ size = 24, strokeWidth: _strokeWidth, style, ...props }: AppIconProps) {
    const id = `glass-${useId().replace(/:/g, '')}-`;
    const labeled = Boolean(props['aria-label'] || props['aria-labelledby'] || props.title);
    const palette = {
      '--nc-gradient-1-color-1': 'currentColor',
      '--nc-gradient-1-color-2': 'currentColor',
      ...style,
    } as CSSProperties;
    return createElement(Icon, { 'aria-hidden': labeled ? undefined : true, role: labeled ? 'img' : undefined, focusable: 'false', ...props, size, uniqueId: id, style: palette });
  };
}

