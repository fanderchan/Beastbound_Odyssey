Use case: generated-original texture source
Asset type: painterly terrain material for a Godot 4 isometric RPG ground atlas

为一款原创的石器幻想题材 2.5D 等距视角 MMORPG 制作一张可用于地面纹理母材的高品质数字绘画。画面必须是纯粹的俯视/等距正交草地表面，不要地平线，不要天空，不要人物、动物、建筑、树、石块、道路、文字、UI、边框或明确独立物体。整体为温暖但不刺眼的橄榄绿、鼠尾草绿与少量金绿色，细腻手绘草叶、苔藓、非常稀疏且微小的暖色花点和自然土壤颗粒；亮度与颜色在整张图上均匀连续，不要中心光斑，不要四角暗角，不要明显方向性光照，不要大块色带，不要规则方格、菱形、边线或重复图案。细节密度中等，远看是统一柔和草坪，近看有大师级手绘笔触；适合被裁成无缝等距菱形地砖，四周边缘必须色调一致、低对比。原创美术，干净、成熟、温暖、具有石器幻想冒险氛围。

Accepted output: `source/raw/firebud-seamless-meadow-v2.png`
Generation call/output id: `exec-026034c5-74d7-4f82-8f8e-6feb7e1307ed`
Runtime derivation: four non-overlapping crops are Lanczos-downsampled to 80×40, clipped to the canonical 2:1 diamond with a bounded 10% alpha bleed that overlaps adjacent raster edges and prevents black seams, and placed in the existing 12-tile atlas. The edge-skirt crop receives only bounded blur/desaturation. Path and plaza crops are rebuilt from the existing generated semantic source without their former high-contrast perimeter.
