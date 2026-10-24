#pragma once
#include "profile.h"

// The active child's profile (lib/vaani_core/src/profile.h), persisted in NVS.
extern Config cfg;

void configLoad();  // defaults, then the saved profile if it parses
void configSave();
