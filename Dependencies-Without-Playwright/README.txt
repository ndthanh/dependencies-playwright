akaBot Playwright test - offline dependency feed

Contents: 88 original .nupkg files, excluding Microsoft.Playwright.
Includes the project.json dependencies and their transitive dependencies,
including RCA.Activities.Core 2.2.0. Some package IDs have multiple versions
to cover dependency requirements from both akaBot's net452 target and net48.
Do not add every package as a direct project dependency; preserve the working
project.json and let the package resolver use this folder as a local feed.

On the test machine:
1. Copy this entire folder to a local path.
2. Add that folder as a package source in akaBot Studio Package Manager.
3. Add your Microsoft.Playwright 1.63.0 .nupkg to the local feed separately.
4. Open the test project's project.json, resolve dependencies and restart
   Studio when prompted. Run Main.xaml.

This folder contains packages only, not the workflow, Chrome installer,
.NET Framework installer or a license. Copy the test workflow separately.
The verified machine had .NET Framework 4.8 and installed Google Chrome.

manifest.csv records each package ID, version, filename, byte count and SHA256.
Every copied package was checked against its source. Packages missing from
the local caches were downloaded from the official NuGet flat-container feed.
No additional packages were installed into Studio while creating this bundle.
