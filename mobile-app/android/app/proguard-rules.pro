# Required for flutter_onnxruntime / ONNX Runtime on Android release builds (R8).
# Without this, OrtSession.run crashes with ClassNotFoundException: TensorInfo.
-keep class ai.onnxruntime.** { *; }
-keep class com.masicai.flutteronnxruntime.** { *; }
