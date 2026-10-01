# Credits and licenses

## Models
- **ISNet `isnet-general-use`** (background removal): from the DIS project by Xuebin Qin et al., Apache License 2.0. The ONNX file is distributed with the `rembg` project releases (https://github.com/danielgatis/rembg). It is used only to compute a mask; the piece's pixels are never altered or regenerated.
- **Amazon Titan Multimodal Embeddings** and **Amazon Nova Pro** (Amazon Bedrock): used under the AWS terms for Bedrock.

## Demonstration photo sets
The sample photos used to demo the pipeline are renders of CC0 3D scans from [Poly Haven](https://polyhaven.com), made with `scripts/render_turntable.py` (Blender). CC0 needs no attribution; it is given anyway:
- "Antique Ceramic Vase 01" by James Ray Cock
- "Wicker Basket 01", "Wooden Bowl 01", "Carved Wooden Elephant" and "Jug 01" by their Poly Haven authors (see each asset page)

These are not photographs of an artisan's real piece; the app labels them as sample or demo content, and this file records their origin.

## Libraries
React, react-router, Tailwind CSS, motion, three.js, react-icons (Lucide), Fontsource (Fraunces, Instrument Sans), numpy, Pillow, onnxruntime, boto3. See each package for its license.
