# Place your road segmentation ONNX here as: model.onnx

Bundled default (lilNewbie U-Net pothole):
- Source: https://github.com/lilNewbie/SemanticSegmentation
- Input:  float32 [1,256,256,3] NHWC, pixels / 255 (stretch resize)
- Output: float32 [1,256,256,2] — channel 0=background, 1=pothole
- Speed bumps are NOT in this model (sensors / Mock still cover them)

Generic alternative manifests may use NCHW + ImageNet normalize.

Without a file, the app runs MockSegmentationService for UI/tracking tests.
You can also import from the in-app Model screen.
