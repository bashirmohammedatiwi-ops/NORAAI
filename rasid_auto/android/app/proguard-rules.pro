-keep class ai.onnxruntime.** { *; }
-dontwarn ai.onnxruntime.**

# Car App Library — host resolves these by name via reflection.
-keep class androidx.car.app.** { *; }
-dontwarn androidx.car.app.**
-keep class com.rasid.rasid_auto.RasidCarAppService { *; }
-keep class com.rasid.rasid_auto.RasidCarSession { *; }
-keep class com.rasid.rasid_auto.RasidCarScreen { *; }
