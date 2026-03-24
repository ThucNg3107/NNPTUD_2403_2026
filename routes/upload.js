let express = require('express')
let router = express.Router()
let { uploadImage, uploadExcel } = require('../utils/uploadHandler')
let path = require('path')
let exceljs = require('exceljs')
let fs = require('fs')
let categoriesModel = require('../schemas/categories')
let productsModel = require('../schemas/products')
let inventoryModel = require('../schemas/inventories')
let userModel = require('../schemas/users')
let roleModel = require('../schemas/roles')
let { sendNewUserPasswordMail } = require('../utils/sendMail')
let mongoose = require('mongoose')
let slugify = require('slugify')
let crypto = require('crypto')

function getCellString(cellValue) {
    if (cellValue === null || cellValue === undefined) return "";
    if (typeof cellValue === "object" && cellValue.text) return String(cellValue.text).trim();
    return String(cellValue).trim();
}

function generateRandomPassword(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*";
    const bytes = crypto.randomBytes(length);
    let password = "";
    for (let i = 0; i < length; i++) {
        password += chars[bytes[i] % chars.length];
    }
    return password;
}

router.post('/one_image', uploadImage.single('file'), function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file not found"
        })
    } else {
        console.log(req.body);
        res.send({
            filename: req.file.filename,
            path: req.file.path,
            size: req.file.size
        })
    }
})
router.post('/multiple_images', uploadImage.array('files', 5), function (req, res, next) {
    if (!req.files) {
        res.status(404).send({
            message: "file not found"
        })
    } else {
        console.log(req.body);
        res.send(req.files.map(f => ({
            filename: f.filename,
            path: f.path,
            size: f.size
        })))
    }
})
router.get('/:filename', function (req, res, next) {
    let pathFile = path.join(
        __dirname, '../uploads', req.params.filename
    )
    res.sendFile(pathFile)
})

router.post('/excel', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        res.status(404).send({
            message: "file not found"
        })
    } else {
        //workbook->worksheet->column/row->cell
        let workbook = new exceljs.Workbook();
        let pathFile = path.join(
            __dirname, '../uploads', req.file.filename
        )
        await workbook.xlsx.readFile(pathFile)
        let worksheet = workbook.worksheets[0];
        let result = []
        let categories = await categoriesModel.find({
        });
        let categoriesMap = new Map();
        for (const category of categories) {
            categoriesMap.set(category.name, category._id)
        }
        let products = await productsModel.find({})
        let getTitle = products.map(p => p.title)
        let getSku = products.map(p => p.sku)

        for (let index = 2; index <= worksheet.rowCount; index++) {
            let errorsInRow = []
            const element = worksheet.getRow(index);
            let sku = element.getCell(1).value;
            let title = element.getCell(2).value;
            let category = element.getCell(3).value;

            let price = Number.parseInt(element.getCell(4).value)
            let stock = Number.parseInt(element.getCell(5).value)

            if (price < 0 || isNaN(price)) {
                errorsInRow.push("price khong hop le")
            }
            if (stock < 0 || isNaN(stock)) {
                errorsInRow.push("stock khong hop le")
            }
            if (!categoriesMap.has(category)) {
                errorsInRow.push('category khong hop le')
            }
            if (getSku.includes(sku)) {
                errorsInRow.push('sku bi trung')
            }
            if (getTitle.includes(title)) {
                errorsInRow.push('title khong hop le')
            }
            if (errorsInRow.length > 0) {
                result.push({
                    success: false,
                    data: errorsInRow
                });
                continue;
            }// 

            let session = await mongoose.startSession();
            session.startTransaction()
            try {
                let newProduct = new productsModel({
                    sku: sku,
                    title: title,
                    slug: slugify(title, {
                        replacement: '-',
                        remove: undefined,
                        lower: true,
                        strict: false,
                    }),
                    price: price,
                    description: title,
                    category: categoriesMap.get(category)
                });
                newProduct = await newProduct.save({ session });
                let newInventory = new inventoryModel({
                    product: newProduct._id,
                    stock: stock
                })
                newInventory = await newInventory.save({ session });
                newInventory = await newInventory.populate('product')
                await session.commitTransaction();
                await session.endSession()
                getTitle.push(title);
                getSku.push(sku)
                result.push({
                    success: true,
                    data: newInventory
                })
            } catch (error) {
                await session.abortTransaction();
                await session.endSession()
                result.push({
                    success: false,
                    data: error.message
                })
            }

        }
        fs.unlinkSync(pathFile)
        res.send(result.map(function (r, index) {
            if (r.success) {
                return { [index + 1]: r.data }
            } else {
                return { [index + 1]: r.data.join(',') }
            }
        }))
    }
})

router.post('/users', uploadExcel.single('file'), async function (req, res, next) {
    if (!req.file) {
        return res.status(404).send({
            message: "file not found"
        })
    }

    const workbook = new exceljs.Workbook();
    const pathFile = path.join(__dirname, '../uploads', req.file.filename);
    const result = [];

    try {
        await workbook.xlsx.readFile(pathFile);
        const worksheet = workbook.worksheets[0];

        if (!worksheet) {
            return res.status(400).send({ message: "excel khong co worksheet" });
        }

        const userRole = await roleModel.findOne({
            name: { $regex: /^user$/i },
            isDeleted: false
        });
        if (!userRole) {
            return res.status(400).send({ message: "khong tim thay role USER/user" });
        }

        const existingUsers = await userModel.find({ isDeleted: false }, { username: 1, email: 1 });
        const existingUsernames = new Set(existingUsers.map(u => String(u.username).toLowerCase()));
        const existingEmails = new Set(existingUsers.map(u => String(u.email).toLowerCase()));

        for (let index = 2; index <= worksheet.rowCount; index++) {
            const row = worksheet.getRow(index);
            const username = getCellString(row.getCell(1).value);
            const email = getCellString(row.getCell(2).value).toLowerCase();
            const errorsInRow = [];

            if (!username) errorsInRow.push("username khong duoc de trong");
            if (!email) {
                errorsInRow.push("email khong duoc de trong");
            } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                errorsInRow.push("email khong hop le");
            }

            if (username && existingUsernames.has(username.toLowerCase())) errorsInRow.push("username da ton tai");
            if (email && existingEmails.has(email)) errorsInRow.push("email da ton tai");

            if (errorsInRow.length > 0) {
                result.push({ row: index, success: false, data: errorsInRow.join(', ') });
                continue;
            }

            const plainPassword = generateRandomPassword(16);
            let createdUser = null;
            try {
                createdUser = new userModel({
                    username: username,
                    email: email,
                    password: plainPassword,
                    role: userRole._id
                });
                await createdUser.save();
                await sendNewUserPasswordMail(email, username, plainPassword);

                existingUsernames.add(username.toLowerCase());
                existingEmails.add(email);
                result.push({
                    row: index,
                    success: true,
                    data: {
                        id: createdUser._id,
                        username: createdUser.username,
                        email: createdUser.email
                    }
                });
            } catch (error) {
                if (createdUser && createdUser._id) {
                    await userModel.deleteOne({ _id: createdUser._id });
                }
                result.push({ row: index, success: false, data: error.message });
            }
        }

        return res.send(result);
    } catch (error) {
        return res.status(400).send({ message: error.message });
    } finally {
        if (fs.existsSync(pathFile)) {
            fs.unlinkSync(pathFile);
        }
    }
})

module.exports = router;
