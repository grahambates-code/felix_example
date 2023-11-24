// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck
import { FirstPersonController } from '@deck.gl/core/typed';
import { Vector3 } from '@math.gl/core';

const ZOOM_SPEED = 4.0;
const PAN_SPEED = 4.0;

const CAMERA_SCREEN_DEPTH = 0.1;

const NO_TRANSITION_PROPS = {
  transitionDuration: 0
};
const DEFAULT_INERTIA = 200;

const INERTIA_EASING = function INERTIA_EASING(t) {
  return 1 - (1 - t) * (1 - t);
};

/**
 * A first-person-style controller that supports panning and zooming.
 *
 * Zooming is implemented by moving the camera position in world space rather than by adjusting the
 * Viewport's zoom/scale factor.  This controller also updates (if provided) a scale value that can be used
 * to provide automatic rescaling of text/icons/etc...
 *
 * Rotation is around the current camera position.
 */

export default class ModelarController extends FirstPersonController<any> {
  /**
   * Zoom along the view direction.
   */
  _zoom({ scale }) {
    let { startZoomPosition } = this.controllerState.getState();

    if (!startZoomPosition) {
      startZoomPosition = this.controllerState.getViewportProps().position;
    }

    const direction = this.controllerState.getDirection();
    return this._move(direction, Math.log2(scale) * ZOOM_SPEED, startZoomPosition);
  }

  /**
   * Move the camera along a specific direction from a starting position.
   */
  _move(direction, speed, fromPosition = this.getViewportProps().position) {
    const delta = direction.scale(speed);
    const newControllerState = this._getNewControllerState();
    newControllerState.getViewportProps().position = new Vector3(fromPosition).add(delta);
    return newControllerState;
  }

  /**
   * Create a new controller state object.
   *
   * Note: this is a hack implemented because the FirstPersonViewport's state isn't exported by
   * Deck.gl and so can't be instantiated directly.
   */
  _getNewControllerState() {
    // use a dummy call to clone the controller state
    const currentPosition = this.controllerState.getViewportProps().position;
    return this.controllerState.rotateStart({ position: currentPosition });
  }

  /**
   * Convert a pixel position to lat/lon/alt.
   *
   */
  _unproject(pos) {
    const viewportProps = this.controllerState.getViewportProps();
    const viewport = this.makeViewport(viewportProps);
    return pos && viewport.unproject(pos);
  }

  /**
   * Returns the scale factor that should be applied to all objects that should remain of equal size as
   * the camera moves.
   */
  _computeScreenScaleFactor() {
    const scale = 1.5;
    return scale;
  }

  /**
   * Stores the internal state needed to handle a pan operation from the clicked on mouse screen position.
   *
   * Stores the starting (lat/lon/alt) and camera position (in meters).  Also cache
   * the viewport to use consistent projections while panning.
   */
  _storePanStartState(ref) {
    // the screen position in pixels, assumed to be in the camera plane
    const pos = [ref.pos[0], ref.pos[1], CAMERA_SCREEN_DEPTH];

    // store the mouse down position (3D world coordinates)
    this.startPanLngLat = this._unproject(pos);

    // store the starting camera position when clicked (meters offset from lat/lon/0)
    this.startPanCameraPosition = this.controllerState.getViewportProps().position;

    // Save the viewport when starting a pan so that transformations are consistent
    this.startPanViewport = this.makeViewport(this.controllerState.getViewportProps());
  }

  /**
   * Returns the new controller state needed to move camera in plane to the current mouse screen position.
   *
   * Note: this operation only updates the camera position, not the stored scan center (viewport latitude/longitude).
   */
  _computePanMoveState(ref) {
    const pos = [ref.pos[0], ref.pos[1], CAMERA_SCREEN_DEPTH];
    const { startPos } = ref;
    const startPanLngLat = this.startPanLngLat || this._unproject(startPos);
    const startCameraPos = this.startPanCameraPosition;

    if (!startPanLngLat || !startCameraPos) {
      return this.controllerState;
    }

    // compute a world space vector that defines the translation from the
    // start point to the current point (this could be cached)
    const distanceScales = this.startPanViewport.getDistanceScales(startPanLngLat);
    const { metersPerUnit } = distanceScales;

    // use the stored viewport to preserve transformations
    const currentPanLngLat = this.startPanViewport.unproject(pos);

    const yMeters = (currentPanLngLat[1] - startPanLngLat[1]) * metersPerUnit[1];
    const xMeters = (currentPanLngLat[0] - startPanLngLat[0]) * metersPerUnit[0];
    const zMeters = currentPanLngLat[2] - startPanLngLat[2];

    const shiftVec = new Vector3(xMeters, yMeters, zMeters);

    // the origin is assumed to be at (0, 0, 0) in common space, so len gives distance
    // to origin
    const distance = new Vector3(this.controllerState.getViewportProps().position).len();

    // make movement speed proportional to distance from center
    const panSpeed = PAN_SPEED * (1.0 + distance);
    const scaledShiftVec = shiftVec.multiplyByScalar(panSpeed);

    // add the difference vector to the camera position, leaving latitude and longitude the same
    const newCameraPosition = new Vector3(startCameraPos).subtract(scaledShiftVec);
    const newControllerState = this._getNewControllerState();
    newControllerState.getViewportProps().position = newCameraPosition;

    return newControllerState;
  }

  /**
   * Ends the pan operation.
   */
  _resetPanState() {
    this.startPanCameraPosition = null;
    this.startPanLngLat = null;
    this.startPanViewport = null;
  }

  /**
   * Internal pan move handling.
   */
  _onPanMove(event) {
    if (!this.dragPan) {
      return false;
    }

    const pos = this.getCenter(event);

    const newControllerState = this._computePanMoveState({
      pos
    });
    this.updateViewport(newControllerState, NO_TRANSITION_PROPS, {
      isDragging: true,
      isPanning: true
    });
    return true;
  }

  /**
   * Internal implementation for pan end.
   *
   * This method handles pan inertia (continued camera movement after the drag ends).
   */
  _onPanMoveEnd(event) {
    const inertia = DEFAULT_INERTIA;

    if (this.dragPan && inertia && event.velocity) {
      const pos = this.getCenter(event);
      const endPos = [
        pos[0] + (event.velocityX * inertia) / 2,
        pos[1] + (event.velocityY * inertia) / 2
      ];
      const newControllerState = this._computePanMoveState({
        pos: endPos
      });
      this._resetPanState();

      const transitionProps = this._getTransitionProps();
      transitionProps.transitionDuration = inertia;
      transitionProps.transitionEasing = INERTIA_EASING;

      this.updateViewport(
        newControllerState,
        { ...transitionProps },
        {
          isDragging: false,
          isPanning: true
        }
      );
    } else {
      this._resetPanState();

      this.updateViewport(this.controllerState, null, {
        isDragging: false,
        isPanning: false
      });
    }

    return true;
  }

  /**
   * Handle the end of a drag.
   */
  _handleDragEnd(event) {
    if (!this.isDragging()) {
      return false;
    }

    return this._computePanMoveState ? this._onPanMoveEnd(event) : this._onPanRotateEnd(event);
  }

  /**
   * Handle the end of a drag.
   */
  _handleDragStart(event) {
    const pos = this.getCenter(event);

    if (!this.isPointInBounds(pos, event)) {
      return false;
    }

    let alternateMode = this.isFunctionKeyPressed(event) || event.rightButton || false;

    if (this.invertPan || this.dragMode === 'pan') {
      alternateMode = !alternateMode;
    }

    let newControllerState = this._getNewControllerState();

    if (alternateMode) {
      newControllerState = this.controllerState.rotateStart({ pos });
    } else {
      this._storePanStartState({ pos });
    }

    this._panMove = !alternateMode;
    this.updateViewport(newControllerState, NO_TRANSITION_PROPS, {
      isDragging: true
    });

    return true;
  }

  /**
   * Handles a pan or rotate event after a drag has started.
   */
  _handleDragEvent(event) {
    if (!this.isDragging()) {
      return false;
    }

    // _onPanRotate is implemented in FirstPersonController
    return this._panMove ? this._onPanMove(event) : this._onPanRotate(event);
  }

  /**
   * Handles a wheel event (zoom)
   */
  _handleWheelEvent(event) {
    if (!this.scrollZoom) {
      return false;
    }
    event.srcEvent.preventDefault();
    const pos = super.getCenter(event);

    if (!super.isPointInBounds(pos, event)) {
      return false;
    }

    const reference = this.scrollZoom === true ? {} : this.scrollZoom;
    const speed = reference.speed === undefined ? 0.01 : reference.speed;
    const smooth = reference.smooth === undefined ? false : reference.smooth;

    const { delta } = event;
    let scale = 2 / (1 + Math.exp(-Math.abs(delta * speed)));

    if (delta < 0 && scale !== 0) {
      scale = 1 / scale;
    }

    const newControllerState = this._zoom({
      pos,
      scale
    });

    super.updateViewport(
      newControllerState,
      {
        ...this._getTransitionProps({ around: pos }),
        transitionDuration: smooth ? 250 : 1
      },
      {
        isZooming: true,
        isPanning: true
      }
    );
    return true;
  }

  /**
   * Handles a double tap zoom event.
   */
  _handleDoubleTap(event) {
    // Default handler for the `doubletap` event.
    const pos = this.getCenter(event);

    if (!this.isPointInBounds(pos, event)) {
      return false;
    }

    const isZoomOut = this.isFunctionKeyPressed(event);

    // the origin is assumed to be at (0, 0, 0) in common space, so len gives distance
    // to origin
    const distance = new Vector3(this.controllerState.getViewportProps().position).len();

    // make double tap zoom distance proportional to distance from center
    const scale = 1.0 + distance;

    const newControllerState = this._zoom({
      pos,
      scale: isZoomOut ? 1.0 / scale : scale
    });

    this.updateViewport(newControllerState, this._getTransitionProps({ around: pos }), {
      isZooming: true,
      isPanning: true
    });
    this.blockEvents(100);
    return true;
  }

  /**
   * Overload.
   */
  setProps(props) {
    this.sizeScaleSetter = props.setSizeScale;
    super.setProps(props);
  }

  /**
   * Overload.
   */
  handleEvent(event) {
    // This is necessary to avoid any issues with smooth zooming and panning.s
    this._controllerState = undefined;
    const eventStartBlocked = this._eventStartBlocked;

    // Compute and propagate the screen scaling factor.
    if (this.sizeScaleSetter) {
      this.sizeScaleSetter(this._computeScreenScaleFactor());
    }

    switch (event.type) {
      case `panstart`:
        return eventStartBlocked ? false : this._handleDragStart(event);

      case `panend`:
        return this._handleDragEnd(event);

      case 'panmove':
        return this._handleDragEvent(event);

      case 'wheel':
        return this._handleWheelEvent(event);

      case 'doubletap':
        return this._handleDoubleTap(event);

      default:
        return super.handleEvent(event);
    }
  }
}
