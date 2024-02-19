import cv2
import numpy as np

def detect_moving_object(frame, background):
    fgmask = cv2.absdiff(background, frame)
    fgmask = cv2.cvtColor(fgmask, cv2.COLOR_BGR2GRAY)
    _, fgmask = cv2.threshold(fgmask, 50, 255, cv2.THRESH_BINARY)
    
    contours, _ = cv2.findContours(fgmask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if contours:
        largest_contour = max(contours, key=cv2.contourArea)
        if cv2.contourArea(largest_contour) > 500:
            x, y, w, h = cv2.boundingRect(largest_contour)
            return (x, y, w, h)
    return None

def initialize_tracker(frame, bbox):
    tracker = cv2.TrackerCSRT_create()
    tracker.init(frame, bbox)
    return tracker

def update_pan_tilt(bbox, frame_shape):
    center_x = bbox[0] + bbox[2] / 2
    center_y = bbox[1] + bbox[3] / 2
    frame_center_x, frame_center_y = frame_shape[1] / 2, frame_shape[0] / 2
    error_x = center_x - frame_center_x
    error_y = center_y - frame_center_y

    # Example scaling - adjust according to your pan-tilt hardware
    scale_factor = 0.1  # Example scale factor
    scaled_error_x = error_x * scale_factor
    scaled_error_y = error_y * scale_factor

    # Limiting the error values (assuming servo range -90 to 90 degrees)
    scaled_error_x = max(min(scaled_error_x, 90), -90)
    scaled_error_y = max(min(scaled_error_y, 90), -90)

    print(f"Scaled and limited pan-tilt adjustments by error_x: {scaled_error_x}, error_y: {scaled_error_y}")
    # Implement the actual pan-tilt adjustment here

video = cv2.VideoCapture(0)
ret, frame = video.read()
if not ret:
    print("Failed to grab frame")
    video.release()
    cv2.destroyAllWindows()

background = frame.copy()
tracker_initialized = False
tracker = None

while True:
    ret, frame = video.read()
    if not ret:
        break

    if not tracker_initialized:
        bbox = detect_moving_object(frame, background)
        if bbox:
            tracker = initialize_tracker(frame, bbox)
            tracker_initialized = True
    else:
        success, bbox = tracker.update(frame)
        if success:
            p1 = (int(bbox[0]), int(bbox[1]))
            p2 = (int(bbox[0] + bbox[2]), int(bbox[1] + bbox[3]))
            cv2.rectangle(frame, p1, p2, (255,0,0), 2, 1)
            update_pan_tilt(bbox, frame.shape)
        else:
            # Reset tracking if object lost
            print("Tracking lost. Waiting for new object...")
            tracker_initialized = False

    cv2.imshow("Frame", frame)
    if cv2.waitKey(25) & 0xFF == ord('q'):
        break

video.release()
cv2.destroyAllWindows()
