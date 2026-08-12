import 'package:path/path.dart' as p;
import 'package:sqflite/sqflite.dart';

import '../models/road_event.dart';

class LocalStore {
  LocalStore._();
  static final LocalStore instance = LocalStore._();

  Database? _db;

  Future<Database> get db async {
    if (_db != null) return _db!;
    final dir = await getDatabasesPath();
    _db = await openDatabase(
      p.join(dir, 'rasid_auto.db'),
      version: 3,
      onCreate: (db, version) async {
        await db.execute('''
          CREATE TABLE events (
            id TEXT PRIMARY KEY,
            kind TEXT NOT NULL,
            label_ar TEXT NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            confidence REAL NOT NULL,
            created_at TEXT NOT NULL,
            speed_kmh REAL,
            heading REAL,
            note TEXT,
            source TEXT,
            severity TEXT,
            sensor_verified INTEGER NOT NULL DEFAULT 0,
            track_id INTEGER,
            camera_confidence REAL,
            sensor_confidence REAL,
            final_confidence REAL
          )
        ''');
        await db.execute('''
          CREATE TABLE fines (
            id TEXT PRIMARY KEY,
            speed_kmh REAL NOT NULL,
            limit_kmh REAL NOT NULL,
            latitude REAL NOT NULL,
            longitude REAL NOT NULL,
            created_at TEXT NOT NULL,
            duration_seconds REAL,
            note TEXT,
            resolved INTEGER NOT NULL DEFAULT 0,
            amount_iqd INTEGER NOT NULL DEFAULT 200000
          )
        ''');
        await db.execute(
          'CREATE INDEX idx_events_created ON events(created_at DESC)',
        );
        await db.execute(
          'CREATE INDEX idx_fines_created ON fines(created_at DESC)',
        );
      },
      onUpgrade: (db, oldVersion, newVersion) async {
        if (oldVersion < 2) {
          Future<void> add(String sql) async {
            try {
              await db.execute(sql);
            } catch (_) {}
          }

          await add('ALTER TABLE events ADD COLUMN heading REAL');
          await add('ALTER TABLE events ADD COLUMN severity TEXT');
          await add(
            'ALTER TABLE events ADD COLUMN sensor_verified INTEGER NOT NULL DEFAULT 0',
          );
          await add('ALTER TABLE events ADD COLUMN track_id INTEGER');
          await add('ALTER TABLE events ADD COLUMN camera_confidence REAL');
          await add('ALTER TABLE events ADD COLUMN sensor_confidence REAL');
          await add('ALTER TABLE events ADD COLUMN final_confidence REAL');
        }
        if (oldVersion < 3) {
          try {
            await db.execute(
              'ALTER TABLE fines ADD COLUMN amount_iqd INTEGER NOT NULL DEFAULT 200000',
            );
          } catch (_) {}
        }
      },
    );
    return _db!;
  }

  Future<void> insertEvent(RoadEvent e) async {
    final d = await db;
    await d.insert(
      'events',
      e.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<RoadEvent>> recentEvents({int limit = 200}) async {
    final d = await db;
    final rows = await d.query(
      'events',
      orderBy: 'created_at DESC',
      limit: limit,
    );
    return rows.map(RoadEvent.fromMap).toList();
  }

  Future<List<RoadEvent>> eventsNear({
    required double lat,
    required double lng,
    double radiusKm = 15,
    int limit = 100,
  }) async {
    final all = await recentEvents(limit: 500);
    return all
        .where((e) {
          final dLat = (e.latitude - lat).abs();
          final dLng = (e.longitude - lng).abs();
          final approxKm = ((dLat * dLat + dLng * dLng).abs()) * 111;
          return approxKm <= radiusKm * radiusKm;
        })
        .take(limit)
        .toList();
  }

  Future<void> deleteEvent(String id) async {
    final d = await db;
    await d.delete('events', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> insertFine(SpeedFine f) async {
    final d = await db;
    await d.insert(
      'fines',
      f.toMap(),
      conflictAlgorithm: ConflictAlgorithm.replace,
    );
  }

  Future<List<SpeedFine>> allFines() async {
    final d = await db;
    final rows = await d.query('fines', orderBy: 'created_at DESC');
    return rows.map(SpeedFine.fromMap).toList();
  }

  Future<void> updateFine(SpeedFine f) async {
    final d = await db;
    await d.update('fines', f.toMap(), where: 'id = ?', whereArgs: [f.id]);
  }

  Future<void> deleteFine(String id) async {
    final d = await db;
    await d.delete('fines', where: 'id = ?', whereArgs: [id]);
  }

  Future<void> clearFines() async {
    final d = await db;
    await d.delete('fines');
  }
}
