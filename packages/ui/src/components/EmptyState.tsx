import React, { memo } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "./Text";
import { space } from "../tokens";

type Props = {
  title: string;
  description?: string;
  action?: React.ReactNode;
};

function EmptyStateInner({ title, description, action }: Props) {
  return (
    <View style={styles.wrap}>
      <Text variant="heading" align="center">{title}</Text>
      {description ? (
        <Text variant="body" tone="secondary" align="center">
          {description}
        </Text>
      ) : null}
      {action ?? null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingVertical: space.xxl, gap: space.md, alignItems: "center" }
});

export const EmptyState = memo(EmptyStateInner);
