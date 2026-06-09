import 'package:flutter/material.dart';

bool isLandscape(BuildContext context) =>
    MediaQuery.sizeOf(context).width > MediaQuery.sizeOf(context).height;

double screenWidth(BuildContext context) => MediaQuery.sizeOf(context).width;

double screenHeight(BuildContext context) => MediaQuery.sizeOf(context).height;
