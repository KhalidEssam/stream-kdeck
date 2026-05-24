import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import {
  SpotlightRect,
  TooltipStyle,
  buildSpotlightPath,
  resolveTooltipStyle,
} from './GuidedTour.helpers';

export interface GuidedTourRefs {
  tileGrid: React.RefObject<View>;
  tabBar: React.RefObject<View>;
  fab: React.RefObject<View>;
  settings: React.RefObject<View>;
  plugins: React.RefObject<View>;
  contextStrip: React.RefObject<View>;
}

interface GuidedTourProps {
  visible: boolean;
  onDismiss: () => void;
  refs: GuidedTourRefs;
}

interface TourStep {
  targetKey: keyof GuidedTourRefs;
  title: string;
  body: string;
  preferredTooltipPosition: 'above' | 'below';
}

const TOUR_STEPS: TourStep[] = [
  {
    targetKey: 'tileGrid',
    title: 'Tap a tile to run it',
    body: "AI tools act on whatever's in your clipboard. Hold a tile to pin, remove, or customize its icon.",
    preferredTooltipPosition: 'above',
  },
  {
    targetKey: 'tabBar',
    title: 'Switch tabs to change context',
    body: 'AI Tools, Apps, and Media each show a different set of controls for your workflow.',
    preferredTooltipPosition: 'below',
  },
  {
    targetKey: 'fab',
    title: 'Add tiles from the + button',
    body: 'Swipe it in from the right edge, or tap it when expanded to open the tile picker.',
    preferredTooltipPosition: 'above',
  },
  {
    targetKey: 'settings',
    title: 'Customize your layout',
    body: 'Change tile grid size, rearrange your tiles, and manage keyboard shortcuts.',
    preferredTooltipPosition: 'below',
  },
  {
    targetKey: 'plugins',
    title: 'Extend with Plugins',
    body: 'Connect OBS, Spotify, and other apps to control them directly from your deck.',
    preferredTooltipPosition: 'below',
  },
  {
    targetKey: 'contextStrip',
    title: 'Context-aware shortcuts',
    body: 'This bar adapts to your active app. Add your own per-app keyboard shortcuts here.',
    preferredTooltipPosition: 'above',
  },
];

export function GuidedTour({ visible, onDismiss, refs }: GuidedTourProps) {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [currentStep, setCurrentStep] = useState(0);
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const step = TOUR_STEPS[currentStep];

  // Measure the target element whenever the step changes or the tour becomes visible
  useEffect(() => {
    if (!visible) return;
    setSpotlightRect(null);
    const targetRef = refs[step.targetKey];
    // Small delay lets layout settle before measuring
    const timer = setTimeout(() => {
      targetRef.current?.measure((_x, _y, width, height, pageX, pageY) => {
        setSpotlightRect({ x: pageX, y: pageY, width, height });
      });
    }, 50);
    return () => clearTimeout(timer);
  }, [visible, currentStep, refs, step.targetKey]);

  // Fade in when spotlight rect is ready
  useEffect(() => {
    if (spotlightRect) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 150,
        useNativeDriver: true,
      }).start();
    } else {
      fadeAnim.setValue(0);
    }
  }, [spotlightRect, fadeAnim]);

  // Reset to step 0 when tour re-opens
  useEffect(() => {
    if (visible) setCurrentStep(0);
  }, [visible]);

  const handleNext = () => {
    if (currentStep < TOUR_STEPS.length - 1) {
      fadeAnim.setValue(0);
      setCurrentStep((s) => s + 1);
    } else {
      onDismiss();
    }
  };

  const handleBack = () => {
    if (currentStep > 0) {
      fadeAnim.setValue(0);
      setCurrentStep((s) => s - 1);
    }
  };

  const svgPath = buildSpotlightPath({ width: screenWidth, height: screenHeight }, spotlightRect);

  let tooltipStyle: TooltipStyle | null = null;
  if (spotlightRect) {
    tooltipStyle = resolveTooltipStyle(
      spotlightRect,
      step.preferredTooltipPosition,
      screenHeight,
    );
  }

  const isLastStep = currentStep === TOUR_STEPS.length - 1;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onDismiss}>
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {/* SVG overlay — always rendered so the dark backdrop is immediate */}
        <Svg
          width={screenWidth}
          height={screenHeight}
          style={StyleSheet.absoluteFill}
        >
          <Path
            d={svgPath}
            fill="rgba(0,0,0,0.75)"
            fillRule="evenodd"
          />
        </Svg>

        {/* Skip button — top-right corner, always accessible */}
        <TouchableOpacity style={styles.skipBtn} onPress={onDismiss} activeOpacity={0.75}>
          <Text style={styles.skipBtnText}>Skip tour</Text>
        </TouchableOpacity>

        {/* Tooltip card — fades in after measurement */}
        {tooltipStyle && (
          <Animated.View
            style={[styles.tooltip, tooltipStyle, { opacity: fadeAnim }]}
            pointerEvents="box-none"
          >
            <Text style={styles.tooltipTitle}>{step.title}</Text>
            <Text style={styles.tooltipBody}>{step.body}</Text>

            <View style={styles.navRow}>
              <Text style={styles.stepLabel}>
                Step {currentStep + 1} of {TOUR_STEPS.length}
              </Text>
              <View style={styles.navButtons}>
                {currentStep > 0 && (
                  <TouchableOpacity
                    style={styles.backBtn}
                    onPress={handleBack}
                    activeOpacity={0.75}
                  >
                    <Text style={styles.backBtnText}>← Back</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.nextBtn}
                  onPress={handleNext}
                  activeOpacity={0.8}
                >
                  <Text style={styles.nextBtnText}>
                    {isLastStep ? 'Start using KDeck' : 'Next →'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  skipBtn: {
    position: 'absolute',
    top: 52,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipBtnText: {
    color: '#9898B0',
    fontSize: 13,
    fontWeight: '600',
  },
  tooltip: {
    position: 'absolute',
    backgroundColor: '#1E1E30',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#5B4FE8',
    padding: 16,
  },
  tooltipTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  tooltipBody: {
    color: '#9898B0',
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 16,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepLabel: {
    color: '#4A4A6A',
    fontSize: 12,
    fontWeight: '600',
  },
  navButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  backBtn: {
    backgroundColor: '#2A2A45',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: {
    color: '#9898B0',
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    backgroundColor: '#5B4FE8',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  nextBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
